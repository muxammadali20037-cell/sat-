import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import { ApiError, notFoundError } from '@/lib/api/errors'
import { getAiProvider, aiModels } from '@/lib/ai/provider'
import { loadPricing, createUsageSink } from '@/lib/ai/usage'
import { runStructured } from '@/lib/ai/run'
import {
  GeneratedPracticeSchema,
  PracticeVerificationSchema,
  SCHEMA_NAMES,
  TutorResponseSchema,
  type GeneratedPractice,
  type TutorResponse,
} from '@/lib/ai/schemas'
import {
  buildConversation,
  buildExplainUserContent,
  buildGenerationUserContent,
  buildHintUserContent,
  buildVerificationUserContent,
  generationSystemPrompt,
  tutorSystemPrompt,
  verificationSystemPrompt,
  wrapStudentMessage,
} from '@/lib/ai/prompts'
import { assertWithinLimit } from '@/features/entitlements/server'
import { getTaxonomy, type Taxonomy } from '@/features/taxonomy/server'
import { loadAnswerKeys, loadExplanations, loadSafeQuestions } from '@/features/questions/server'
import { lockedQuestionIds } from '@/features/practice/queries'
import { SUBJECT_LABELS } from '@/types/questions'
import { ACCESS_MESSAGES, decideExplain, decideGenerateFromQuestion, decideHint } from './gating'
import { loadQuestionFacts, toQuestionContextInput } from './context'
import {
  applyExplainPolicy,
  applyHintPolicy,
  clampText,
  clampTutorResponse,
  cleanGeneratedDraft as cleanDraft,
  validateGeneratedDraft as validateDraft,
  formatStudentAnswer,
  formatVerifiedAnswer,
  hintRevealsAnswer,
  matchSkill,
  sessionTitle,
  tutorResponseToText,
} from './postprocess'
import { currentUsage, deleteSessionIfEmpty, ensureSession, loadHistory, loadRelated, persistExchange } from './server'
import type {
  GenerateAnswerResponse,
  HintLevel,
  SafeGeneratedQuestion,
  TutorMode,
  TutorStructured,
  TutorTurnResponse,
} from './schemas'

/** Endpoint business logic for /api/ai/* (tutor). Handlers authenticate + validate, then call these. */

export type TutorCtx = { userId: string; profile: CurrentProfile; admin: Db; db: Db }

async function prepare(ctx: TutorCtx) {
  const provider = getAiProvider() // 503 AI_NOT_CONFIGURED before anything else
  await assertWithinLimit(ctx.userId, 'ai_requests_daily', ctx.profile.timezone, 1)
  const [taxonomy, pricing] = await Promise.all([getTaxonomy(ctx.db), loadPricing(ctx.admin)])
  return { provider, taxonomy, pricing, sink: createUsageSink(ctx.admin), models: aiModels() }
}
type Prepared = Awaited<ReturnType<typeof prepare>>

/** in_timed_test → 409 CONFLICT (integrity rule shared with practice); other refusals → 403. */
const forbidden = (reason: keyof typeof ACCESS_MESSAGES) =>
  reason === 'in_timed_test'
    ? new ApiError(409, 'CONFLICT', ACCESS_MESSAGES.in_timed_test, { reason })
    : new ApiError(403, 'FORBIDDEN', ACCESS_MESSAGES[reason], { reason })

/**
 * The tutor must never become a channel into a running diagnostic or mock exam: any question that
 * belongs to one of the student's in-progress timed tests (including mock modules not reached yet)
 * is refused, whatever else is true.
 */
export async function assertNotLocked(admin: Db, userId: string, questionId: string): Promise<void> {
  const locked = await lockedQuestionIds(admin, userId)
  if (locked.has(questionId)) throw forbidden('in_timed_test')
}

async function tutorTurn(
  ctx: TutorCtx,
  p: Prepared,
  opts: {
    mode: TutorMode
    sessionId?: string
    newSessionTitle: string
    contextQuestionId: string | null
    storedUserContent: string
    modelUserContent: string
    system: string
    validate?: (r: TutorResponse) => string | null
    finalize: (r: TutorResponse) => TutorResponse
    questionSkillId: string | null
    hintLevel?: HintLevel
  },
): Promise<TutorTurnResponse> {
  const session = await ensureSession(ctx.admin, ctx.userId, opts.sessionId, {
    title: opts.newSessionTitle,
    contextQuestionId: opts.contextQuestionId,
  })
  try {
    const history = session.created ? [] : await loadHistory(ctx.admin, ctx.userId, session.id)
    const run = await runStructured({
      provider: p.provider,
      sink: p.sink,
      pricing: p.pricing,
      endpoint: opts.mode,
      userId: ctx.userId,
      sessionId: session.id,
      validate: opts.validate,
      request: {
        system: opts.system,
        messages: buildConversation(history, opts.modelUserContent),
        schema: TutorResponseSchema,
        jsonSchemaName: SCHEMA_NAMES.tutor,
        model: p.models.tutor,
        maxTokens: 2500,
      },
    })
    let response = opts.finalize(clampTutorResponse(run.data))
    const relatedSkillId = opts.questionSkillId ?? matchSkill(response.related_skill, p.taxonomy.skills)
    if (relatedSkillId) response = { ...response, related_skill: p.taxonomy.skillById.get(relatedSkillId)?.name ?? response.related_skill }

    const structured: TutorStructured = {
      kind: 'tutor',
      response,
      meta: {
        mode: opts.mode,
        provider: run.provider,
        hintLevel: opts.hintLevel ?? null,
        relatedSkillId,
        questionId: opts.contextQuestionId,
      },
    }
    const persisted = await persistExchange(ctx.admin, {
      sessionId: session.id,
      userId: ctx.userId,
      mode: opts.mode,
      questionId: opts.contextQuestionId,
      userContent: opts.storedUserContent,
      assistantContent: tutorResponseToText(response),
      structured,
    })
    const [usage, related] = await Promise.all([
      currentUsage(ctx.userId, ctx.profile.timezone),
      loadRelated(ctx.db, p.taxonomy, relatedSkillId),
    ])
    return {
      sessionId: session.id,
      sessionTitle: session.title,
      isNewSession: session.created,
      userMessage: persisted.user,
      assistantMessage: persisted.assistant,
      related,
      usage,
    }
  } catch (err) {
    if (session.created) await deleteSessionIfEmpty(ctx.admin, ctx.userId, session.id).catch(() => undefined)
    throw err
  }
}

const skillNames = (t: Taxonomy) => t.skills.map((s) => s.name)

export async function tutorChat(ctx: TutorCtx, body: { sessionId?: string; message: string }): Promise<TutorTurnResponse> {
  const p = await prepare(ctx)
  return tutorTurn(ctx, p, {
    mode: 'chat',
    sessionId: body.sessionId,
    newSessionTitle: sessionTitle(body.message, 60),
    contextQuestionId: null,
    storedUserContent: body.message,
    modelUserContent: wrapStudentMessage(body.message),
    system: tutorSystemPrompt({ mode: 'chat', locale: ctx.profile.locale, skills: skillNames(p.taxonomy) }),
    finalize: (r) => r,
    questionSkillId: null,
  })
}

export async function tutorExplain(
  ctx: TutorCtx,
  body: { questionId: string; sessionId?: string; message?: string },
): Promise<TutorTurnResponse> {
  const p = await prepare(ctx)
  await assertNotLocked(ctx.admin, ctx.userId, body.questionId)
  const { facts, latestScored } = await loadQuestionFacts(ctx.admin, ctx.userId, body.questionId)
  const decision = decideExplain(facts)
  if (!decision.allowed || !latestScored) throw forbidden(decision.reason === 'ok' ? 'not_answered' : decision.reason)

  const [safe, keys, explanations] = await Promise.all([
    loadSafeQuestions(ctx.admin, [body.questionId]),
    loadAnswerKeys(ctx.admin, [body.questionId]),
    loadExplanations(ctx.admin, [body.questionId], ctx.profile.locale),
  ])
  const question = safe.get(body.questionId)
  if (!question) throw notFoundError('Question')
  const key = keys.get(body.questionId)
  if (!key) throw new ApiError(409, 'CONFLICT', 'This question has no verified answer on file yet.')

  const verifiedAnswer = formatVerifiedAnswer(question, key)
  const studentAnswer = formatStudentAnswer(question, latestScored)
  return tutorTurn(ctx, p, {
    mode: 'explain',
    sessionId: body.sessionId,
    newSessionTitle: sessionTitle(`${question.skillName}: ${question.stem}`),
    contextQuestionId: question.id,
    storedUserContent: body.message ?? '',
    modelUserContent: buildExplainUserContent(
      toQuestionContextInput(question),
      { answer: verifiedAnswer, explanation: explanations.get(question.id) ?? null },
      { answer: studentAnswer, isCorrect: latestScored.isCorrect },
      body.message,
    ),
    system: tutorSystemPrompt({ mode: 'explain', locale: ctx.profile.locale, skills: skillNames(p.taxonomy) }),
    finalize: (r) => applyExplainPolicy(r, verifiedAnswer),
    questionSkillId: question.skillId,
  })
}

export async function tutorHint(
  ctx: TutorCtx,
  body: { questionId: string; sessionId?: string; level: HintLevel; message?: string },
): Promise<TutorTurnResponse> {
  const p = await prepare(ctx)
  await assertNotLocked(ctx.admin, ctx.userId, body.questionId)
  const { facts } = await loadQuestionFacts(ctx.admin, ctx.userId, body.questionId)
  const decision = decideHint(facts)
  if (!decision.allowed) throw forbidden(decision.reason === 'ok' ? 'not_encountered' : decision.reason)

  const [safe, keys] = await Promise.all([
    loadSafeQuestions(ctx.admin, [body.questionId]),
    // Server-side only, for the leak check below. Never part of the prompt.
    loadAnswerKeys(ctx.admin, [body.questionId]),
  ])
  const question = safe.get(body.questionId)
  if (!question) throw notFoundError('Question')
  const key = keys.get(body.questionId)

  return tutorTurn(ctx, p, {
    mode: 'hint',
    sessionId: body.sessionId,
    newSessionTitle: sessionTitle(`${question.skillName}: ${question.stem}`),
    contextQuestionId: question.id,
    storedUserContent: body.message ?? '',
    modelUserContent: buildHintUserContent(toQuestionContextInput(question), body.level, body.message),
    system: tutorSystemPrompt({ mode: 'hint', locale: ctx.profile.locale, skills: skillNames(p.taxonomy), hintLevel: body.level }),
    validate: (r) => (key && hintRevealsAnswer(r, question, key) ? 'answer_leak' : null),
    finalize: applyHintPolicy,
    questionSkillId: question.skillId,
    hintLevel: body.level,
  })
}

// ---------------------------------------------------------------------------
// Generated practice
// ---------------------------------------------------------------------------


export const GENERATION_FAILED_MESSAGE = "We couldn't create a question that passed our accuracy check. Please try again."

export async function generatePractice(
  ctx: TutorCtx,
  body: { skillId?: string; questionId?: string; sessionId?: string },
): Promise<TutorTurnResponse & { generated: SafeGeneratedQuestion }> {
  const p = await prepare(ctx)

  let skillId: string
  let difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  let reference: { stem: string; passage: string | null; options: string[] } | null = null
  let sourceQuestionId: string | null = null
  if (body.questionId) {
    await assertNotLocked(ctx.admin, ctx.userId, body.questionId)
    const { facts } = await loadQuestionFacts(ctx.admin, ctx.userId, body.questionId)
    const decision = decideGenerateFromQuestion(facts)
    if (!decision.allowed) throw forbidden(decision.reason === 'ok' ? 'not_encountered' : decision.reason)
    const q = (await loadSafeQuestions(ctx.admin, [body.questionId])).get(body.questionId)
    if (!q) throw notFoundError('Question')
    skillId = q.skillId
    difficulty = q.difficulty
    reference = { stem: q.stem, passage: q.passage, options: q.options.map((o) => o.content) }
    sourceQuestionId = q.id
  } else {
    skillId = body.skillId!
  }
  const skill = p.taxonomy.skillById.get(skillId)
  if (!skill) throw notFoundError('Skill')
  const domain = p.taxonomy.domainById.get(skill.domainId)!
  const subject = p.taxonomy.subjectById.get(domain.subjectId)!

  const session = await ensureSession(ctx.admin, ctx.userId, body.sessionId, {
    title: sessionTitle(`Practice: ${skill.name}`),
    contextQuestionId: sourceQuestionId,
  })
  try {
    let accepted: { draft: GeneratedPractice; note: string } | null = null
    let rejected: { draft: GeneratedPractice; note: string } | null = null
    let provider: 'anthropic' | 'mock' = p.provider.id

    for (let round = 1; round <= 2 && !accepted; round++) {
      const draftRun = await runStructured({
        provider: p.provider,
        sink: p.sink,
        pricing: p.pricing,
        endpoint: 'generate_practice',
        userId: ctx.userId,
        sessionId: session.id,
        validate: validateDraft,
        request: {
          system: generationSystemPrompt(ctx.profile.locale),
          messages: [
            {
              role: 'user',
              content: buildGenerationUserContent({ subject: SUBJECT_LABELS[subject.code], domain: domain.name, skill: skill.name, difficulty, reference }),
            },
          ],
          schema: GeneratedPracticeSchema,
          jsonSchemaName: SCHEMA_NAMES.generated,
          model: p.models.tutor,
          maxTokens: 2500,
        },
      })
      provider = draftRun.provider
      const draft = cleanDraft(draftRun.data)

      let verdict
      try {
        verdict = await runStructured({
          provider: p.provider,
          sink: p.sink,
          pricing: p.pricing,
          endpoint: 'verify_practice',
          userId: ctx.userId,
          sessionId: session.id,
          request: {
            system: verificationSystemPrompt(),
            messages: [{ role: 'user', content: buildVerificationUserContent(draft) }],
            schema: PracticeVerificationSchema,
            jsonSchemaName: SCHEMA_NAMES.verification,
            model: p.models.tutor,
            maxTokens: 800,
          },
        })
      } catch (err) {
        // The student received nothing: the draft must not count against the daily limit.
        if (draftRun.usageId) await p.sink.updateStatus(draftRun.usageId, 'invalid_output', 'verification_failed')
        throw err
      }

      const note = clampText(verdict.data.note, 500)
      if (verdict.data.selected_index === draft.correct_index && !verdict.data.ambiguous) {
        accepted = { draft, note }
      } else {
        rejected = { draft, note: `Independent solve chose ${verdict.data.selected_index}${verdict.data.ambiguous ? ' (ambiguous)' : ''}: ${note}` }
        if (draftRun.usageId) await p.sink.updateStatus(draftRun.usageId, 'invalid_output', 'verification_mismatch')
      }
    }

    if (!accepted) {
      if (rejected) {
        // Kept (unverified, never shown to students) so editors can see what failed.
        await ctx.admin.from('ai_generated_questions').insert({
          user_id: ctx.userId,
          session_id: session.id,
          skill_id: skill.id,
          source_question_id: sourceQuestionId,
          stem: rejected.draft.stem,
          passage: rejected.draft.passage,
          options: rejected.draft.options,
          correct_index: rejected.draft.correct_index,
          explanation: rejected.draft.explanation,
          verified: false,
          verification_note: rejected.note.slice(0, 1000),
        })
      }
      throw new ApiError(502, 'AI_UNAVAILABLE', GENERATION_FAILED_MESSAGE)
    }

    const { data: row, error } = await ctx.admin
      .from('ai_generated_questions')
      .insert({
        user_id: ctx.userId,
        session_id: session.id,
        skill_id: skill.id,
        source_question_id: sourceQuestionId,
        stem: accepted.draft.stem,
        passage: accepted.draft.passage,
        options: accepted.draft.options,
        correct_index: accepted.draft.correct_index,
        explanation: accepted.draft.explanation,
        verified: true,
        verification_note: accepted.note,
      })
      .select('id')
      .single()
    if (error) throw error

    const generated: SafeGeneratedQuestion = {
      id: row.id,
      stem: accepted.draft.stem,
      passage: accepted.draft.passage,
      options: accepted.draft.options,
      skillId: skill.id,
      skillName: skill.name,
      verified: true,
    }
    const persisted = await persistExchange(ctx.admin, {
      sessionId: session.id,
      userId: ctx.userId,
      mode: 'generate',
      questionId: sourceQuestionId,
      userContent: '',
      assistantContent: accepted.draft.stem,
      structured: { kind: 'generated_practice', generated, meta: { provider, skillId: skill.id } },
    })
    const [usage, related] = await Promise.all([
      currentUsage(ctx.userId, ctx.profile.timezone),
      loadRelated(ctx.db, p.taxonomy, skill.id),
    ])
    return {
      sessionId: session.id,
      sessionTitle: session.title,
      isNewSession: session.created,
      userMessage: persisted.user,
      assistantMessage: persisted.assistant,
      related,
      usage,
      generated,
    }
  } catch (err) {
    if (session.created) await deleteSessionIfEmpty(ctx.admin, ctx.userId, session.id).catch(() => undefined)
    throw err
  }
}

/** Records the student's choice once (first answer wins) and reveals the key + explanation. */
export async function answerGeneratedPractice(
  ctx: Pick<TutorCtx, 'userId' | 'admin'>,
  body: { generatedId: string; selectedIndex: number },
): Promise<GenerateAnswerResponse> {
  const { data: row, error } = await ctx.admin
    .from('ai_generated_questions')
    .select('id, correct_index, explanation, selected_index, verified')
    .eq('id', body.generatedId)
    .eq('user_id', ctx.userId)
    .maybeSingle()
  if (error) throw error
  if (!row || !row.verified) throw notFoundError('Practice question')

  let selected = row.selected_index
  if (selected === null) {
    const { data: updated, error: updateError } = await ctx.admin
      .from('ai_generated_questions')
      .update({ selected_index: body.selectedIndex, answered_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', ctx.userId)
      .is('selected_index', null)
      .select('selected_index')
      .maybeSingle()
    if (updateError) throw updateError
    if (updated) selected = updated.selected_index
    else {
      const { data: again } = await ctx.admin.from('ai_generated_questions').select('selected_index').eq('id', row.id).single()
      selected = again?.selected_index ?? body.selectedIndex
    }
  }
  const selectedIndex = selected ?? body.selectedIndex
  return {
    selectedIndex,
    correctIndex: row.correct_index,
    isCorrect: selectedIndex === row.correct_index,
    explanation: row.explanation,
  }
}
