import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import type { Tables } from '@/types/database'
import type { RevealedAnswer, SafeQuestion, SubjectCode } from '@/types/questions'
import { ApiError } from '@/lib/api/errors'
import { parseSprResponse, scoreAnswer } from '@/lib/scoring'
import { getTaxonomy } from '@/features/taxonomy/server'
import { buildReveal, loadAnswerKeys, loadExplanations, loadSafeQuestions, optionBelongsToQuestion } from '@/features/questions/server'
import { assertWithinLimit, getEntitlements, getUsage, requireFeature } from '@/features/entitlements/server'
import { recordActivity } from '@/features/activity/server'
import { countersFromAnswers } from '@/features/results/aggregate'
import { fetchAllPages, getNumberSetting, isUniqueViolation, loadAnswerHistory, lockedQuestionIds } from './queries'
import { retryQuestionIds, selectPracticeQuestions, type Candidate, type Difficulty } from './select'
import { clampTimeSpent, isPastDeadline, secondsBetween } from './timing'
import {
  DEFAULT_MAX_QUESTIONS_PER_SESSION,
  drillSeconds,
  PRACTICE_HARD_MAX_QUESTIONS,
  PRACTICE_MIN_QUESTIONS,
  type PracticeAnswerInput,
  type StartPracticeInput,
} from './schemas'
import { loadScoredAnswers } from '@/features/mistakes/server'
import { mistakePracticeOrder, splitMistakes } from '@/features/mistakes/notebook'

type Attempt = Tables<'attempts'>

export type PracticeUsage = { used: number; limit: number | null; enabled: boolean }

export async function getPracticeUsage(userId: string, timeZone: string): Promise<PracticeUsage> {
  const ent = await getEntitlements(userId)
  const feature = ent.features.practice_questions_daily
  if (!feature.enabled) return { used: 0, limit: 0, enabled: false }
  const used = await getUsage(userId, 'practice_questions_daily', timeZone)
  return { used, limit: feature.limit, enabled: true }
}

export async function getMaxQuestionsPerSession(admin: Db): Promise<number> {
  return getNumberSetting(admin, 'practice.max_questions_per_session', DEFAULT_MAX_QUESTIONS_PER_SESSION, {
    min: PRACTICE_MIN_QUESTIONS,
    max: PRACTICE_HARD_MAX_QUESTIONS,
  })
}

/** Owned attempt lookup: every attempt read in this workstream goes through an owner filter. */
export async function loadOwnedAttempt(admin: Db, userId: string, attemptId: string, kind?: Attempt['kind']): Promise<Attempt | null> {
  let query = admin.from('attempts').select('*').eq('id', attemptId).eq('user_id', userId)
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data || data.user_id !== userId) return null
  return data
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

type Plan = {
  questionIds: string[]
  fields: Partial<Pick<Attempt, 'practice_set_id' | 'source_attempt_id' | 'subject_id' | 'domain_id' | 'skill_id' | 'difficulty' | 'deadline_at'>>
}

async function remainingQuota(profile: CurrentProfile): Promise<number> {
  const ent = await requireFeature(profile.id, 'practice_questions_daily')
  const limit = ent.features.practice_questions_daily.limit
  if (limit === null) return Number.POSITIVE_INFINITY
  const used = await getUsage(profile.id, 'practice_questions_daily', profile.timezone)
  const remaining = limit - used
  if (remaining <= 0) {
    throw new ApiError(402, 'PLAN_LIMIT_REACHED', 'You have used all of today’s practice questions on your plan.', {
      feature: 'practice_questions_daily',
      used,
      limit,
      plan: ent.planCode,
    })
  }
  return remaining
}

async function planCustom(admin: Db, profile: CurrentProfile, input: Extract<StartPracticeInput, { mode: 'custom' }>, cap: number): Promise<Plan> {
  const taxonomy = await getTaxonomy(admin)
  const subject = taxonomy.subjectByCode.get(input.subjectCode as SubjectCode)
  if (!subject) throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown subject.', { reason: 'invalid_taxonomy' })

  let domainId = input.domainId ?? null
  const skillId = input.skillId ?? null
  if (domainId) {
    const domain = taxonomy.domainById.get(domainId)
    if (!domain || domain.subjectId !== subject.id) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'That domain does not belong to this subject.', { reason: 'invalid_taxonomy' })
    }
  }
  if (skillId) {
    const skill = taxonomy.skillById.get(skillId)
    const skillDomain = skill ? taxonomy.domainById.get(skill.domainId) : undefined
    if (!skill || !skillDomain || skillDomain.subjectId !== subject.id || (domainId && skill.domainId !== domainId)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'That skill does not belong to this domain.', { reason: 'invalid_taxonomy' })
    }
    domainId = skill.domainId
  }

  const count = Math.min(input.count, cap)
  const [rows, history, locked] = await Promise.all([
    fetchAllPages<{ id: string; difficulty: string }>(
      (from, to) => {
        let q = admin.from('questions').select('id, difficulty').eq('status', 'published').eq('subject_id', subject.id)
        if (domainId) q = q.eq('domain_id', domainId)
        if (skillId) q = q.eq('skill_id', skillId)
        if (input.difficulty !== 'mixed') q = q.eq('difficulty', input.difficulty)
        return q.order('id').range(from, to)
      },
      { max: 5000 },
    ),
    loadAnswerHistory(admin, profile.id),
    lockedQuestionIds(admin, profile.id),
  ])

  const candidates: Candidate[] = rows
    .filter((r): r is { id: string; difficulty: Difficulty } => r.difficulty === 'easy' || r.difficulty === 'medium' || r.difficulty === 'hard')
  const questionIds = selectPracticeQuestions({ candidates, history, count, difficulty: input.difficulty, exclude: locked })
  if (questionIds.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'No published questions match these filters yet. Try another skill or difficulty.', {
      reason: 'no_questions',
    })
  }
  return {
    questionIds,
    fields: {
      subject_id: subject.id,
      domain_id: domainId,
      skill_id: skillId,
      difficulty: input.difficulty,
      // The deadline is set by the server from the actual number of questions; the browser only shows it.
      deadline_at: input.timed ? new Date(Date.now() + drillSeconds(input.subjectCode, questionIds.length) * 1000).toISOString() : null,
    },
  }
}

async function planSet(admin: Db, profile: CurrentProfile, practiceSetId: string, cap: number): Promise<Plan> {
  const { data: set, error } = await admin
    .from('practice_sets')
    .select('id, subject_id, domain_id, skill_id, difficulty')
    .eq('id', practiceSetId)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw error
  if (!set) throw new ApiError(404, 'NOT_FOUND', 'Practice set not found.')

  const [{ data: rows, error: rowsError }, locked] = await Promise.all([
    admin
      .from('practice_set_questions')
      .select('question_id, position, questions!inner(status)')
      .eq('practice_set_id', set.id)
      .eq('questions.status', 'published')
      .order('position')
      .order('id'),
    lockedQuestionIds(admin, profile.id),
  ])
  if (rowsError) throw rowsError
  const questionIds = [...new Set((rows ?? []).map((r) => r.question_id))].filter((id) => !locked.has(id)).slice(0, cap)
  if (questionIds.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'This practice set has no questions available right now.', { reason: 'set_empty' })
  }
  return {
    questionIds,
    fields: { practice_set_id: set.id, subject_id: set.subject_id, domain_id: set.domain_id, skill_id: set.skill_id, difficulty: set.difficulty },
  }
}

async function planRetry(admin: Db, profile: CurrentProfile, sourceAttemptId: string, cap: number): Promise<Plan> {
  const source = await loadOwnedAttempt(admin, profile.id, sourceAttemptId)
  if (!source) throw new ApiError(404, 'NOT_FOUND', 'Session not found.')
  // Timed tests are scored only once finalized; their questions stay locked while in progress.
  if (source.kind !== 'practice' && source.status !== 'completed') {
    throw new ApiError(409, 'CONFLICT', 'Finish that test before retrying its questions.', { reason: 'source_in_progress' })
  }

  const [questions, answers, locked] = await Promise.all([
    admin.from('attempt_questions').select('question_id, position, attempt_module_id').eq('attempt_id', source.id).order('position'),
    admin.from('attempt_answers').select('question_id, is_correct').eq('attempt_id', source.id).eq('user_id', profile.id),
    lockedQuestionIds(admin, profile.id),
  ])
  if (questions.error) throw questions.error
  if (answers.error) throw answers.error

  const answerMap = new Map((answers.data ?? []).map((a) => [a.question_id, a.is_correct]))
  const retryIds = retryQuestionIds(
    (questions.data ?? []).map((q) => ({ questionId: q.question_id, position: q.position })),
    answerMap,
  ).filter((id) => !locked.has(id))

  // Only questions that are still published can be practised again.
  let published: string[] = []
  if (retryIds.length > 0) {
    const { data, error } = await admin.from('questions').select('id').in('id', retryIds).eq('status', 'published')
    if (error) throw error
    const ok = new Set((data ?? []).map((r) => r.id))
    published = retryIds.filter((id) => ok.has(id))
  }
  if (published.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'Nothing to retry: every question in that session was answered correctly.', {
      reason: 'nothing_to_retry',
    })
  }
  return {
    questionIds: published.slice(0, cap),
    fields: { source_attempt_id: source.id, subject_id: source.subject_id, domain_id: source.domain_id, skill_id: source.skill_id },
  }
}

async function planBookmarks(admin: Db, profile: CurrentProfile, cap: number): Promise<Plan> {
  const [{ data, error }, locked, max] = await Promise.all([
    admin
      .from('bookmarks')
      .select('question_id, created_at, questions!inner(status)')
      .eq('user_id', profile.id)
      .not('question_id', 'is', null)
      .eq('questions.status', 'published')
      .order('created_at', { ascending: false })
      .limit(500),
    lockedQuestionIds(admin, profile.id),
    getMaxQuestionsPerSession(admin),
  ])
  if (error) throw error
  const ids = (data ?? [])
    .map((b) => b.question_id)
    .filter((id): id is string => !!id && !locked.has(id))
  const questionIds = [...new Set(ids)].slice(0, Math.min(cap, max))
  if (questionIds.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'You have no bookmarked questions to practise yet.', { reason: 'no_bookmarks' })
  }
  return { questionIds, fields: {} }
}

async function planMistakes(admin: Db, profile: CurrentProfile, input: Extract<StartPracticeInput, { mode: 'mistakes' }>, cap: number): Promise<Plan> {
  const taxonomy = await getTaxonomy(admin)
  const subject = input.subjectCode ? taxonomy.subjectByCode.get(input.subjectCode as SubjectCode) : undefined
  if (input.skillId && !taxonomy.skillById.has(input.skillId)) {
    throw new ApiError(400, 'VALIDATION_FAILED', 'Unknown skill.', { reason: 'invalid_taxonomy' })
  }
  const [answers, locked] = await Promise.all([loadScoredAnswers(admin, profile.id), lockedQuestionIds(admin, profile.id)])
  const ordered = mistakePracticeOrder(splitMistakes(answers, locked).open)

  // Only published questions in the requested subject/skill can be practised again.
  const ok = new Map<string, { subject_id: string; skill_id: string }>()
  for (let i = 0; i < ordered.length; i += 150) {
    const { data, error } = await admin.from('questions').select('id, subject_id, skill_id').in('id', ordered.slice(i, i + 150)).eq('status', 'published')
    if (error) throw error
    for (const q of data ?? []) ok.set(q.id, q)
  }
  const questionIds = ordered
    .filter((id) => {
      const q = ok.get(id)
      if (!q) return false
      if (subject && q.subject_id !== subject.id) return false
      if (input.skillId && q.skill_id !== input.skillId) return false
      return true
    })
    .slice(0, cap)
  if (questionIds.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'You have no open mistakes to practise here.', { reason: 'no_mistakes' })
  }
  const skill = input.skillId ? taxonomy.skillById.get(input.skillId) : undefined
  return {
    questionIds,
    fields: { subject_id: subject?.id ?? null, domain_id: skill?.domainId ?? null, skill_id: input.skillId ?? null },
  }
}

export async function startPractice(admin: Db, profile: CurrentProfile, input: StartPracticeInput): Promise<{ attemptId: string; totalQuestions: number }> {
  const remaining = await remainingQuota(profile)
  const max = await getMaxQuestionsPerSession(admin)

  let plan: Plan
  switch (input.mode) {
    case 'custom': {
      if (input.count > max) {
        throw new ApiError(400, 'VALIDATION_FAILED', `A session can have at most ${max} questions.`, { count: [`At most ${max}`], reason: 'too_many' })
      }
      plan = await planCustom(admin, profile, input, remaining)
      break
    }
    case 'set':
      plan = await planSet(admin, profile, input.practiceSetId, Math.min(remaining, PRACTICE_HARD_MAX_QUESTIONS))
      break
    case 'retry':
      plan = await planRetry(admin, profile, input.sourceAttemptId, Math.min(remaining, max))
      break
    case 'bookmarks':
      plan = await planBookmarks(admin, profile, remaining)
      break
    case 'mistakes':
      plan = await planMistakes(admin, profile, input, Math.min(remaining, max))
      break
  }

  const { data: attempt, error } = await admin
    .from('attempts')
    .insert({
      user_id: profile.id,
      kind: 'practice',
      status: 'in_progress',
      practice_mode: input.mode,
      total_questions: plan.questionIds.length,
      ...plan.fields,
    })
    .select('id')
    .single()
  if (error) throw error

  const { error: aqError } = await admin
    .from('attempt_questions')
    .insert(plan.questionIds.map((questionId, i) => ({ attempt_id: attempt.id, question_id: questionId, position: i + 1 })))
  if (aqError) {
    // No multi-statement transactions over PostgREST: remove the empty attempt so it never shows up.
    await admin.from('attempts').delete().eq('id', attempt.id).eq('user_id', profile.id)
    throw aqError
  }
  return { attemptId: attempt.id, totalQuestions: plan.questionIds.length }
}

// ---------------------------------------------------------------------------
// Session payload (safe questions; reveals only for answered questions)
// ---------------------------------------------------------------------------

export type PracticeSessionItem = {
  position: number
  question: SafeQuestion
  answered: boolean
  reveal: RevealedAnswer | null
  bookmarked: boolean
}

export type PracticeSession = {
  attempt: {
    id: string
    status: string
    mode: string
    practiceSetId: string | null
    subjectId: string | null
    domainId: string | null
    skillId: string | null
    difficulty: string | null
    totalQuestions: number
    answeredCount: number
    correctCount: number
    timeSpentSeconds: number
    startedAt: string
    completedAt: string | null
    /** Timed drills only: when the server stops accepting answers. */
    deadlineAt: string | null
  }
  items: PracticeSessionItem[]
}

export async function loadPracticeSession(admin: Db, profile: CurrentProfile, attemptId: string): Promise<PracticeSession | null> {
  const attempt = await loadOwnedAttempt(admin, profile.id, attemptId, 'practice')
  if (!attempt) return null

  const [aq, answers, bookmarks] = await Promise.all([
    admin.from('attempt_questions').select('id, question_id, position').eq('attempt_id', attempt.id).order('position'),
    admin
      .from('attempt_answers')
      .select('question_id, selected_option_id, response_text, is_correct, time_spent_seconds')
      .eq('attempt_id', attempt.id)
      .eq('user_id', profile.id),
    admin.from('bookmarks').select('question_id').eq('user_id', profile.id).not('question_id', 'is', null),
  ])
  if (aq.error) throw aq.error
  if (answers.error) throw answers.error
  if (bookmarks.error) throw bookmarks.error

  const questionIds = (aq.data ?? []).map((r) => r.question_id)
  const answerByQuestion = new Map((answers.data ?? []).map((a) => [a.question_id, a]))
  const answeredIds = [...answerByQuestion.keys()]
  const [safe, keys, explanations] = await Promise.all([
    loadSafeQuestions(admin, questionIds),
    loadAnswerKeys(admin, answeredIds),
    loadExplanations(admin, answeredIds, profile.locale),
  ])
  const bookmarked = new Set((bookmarks.data ?? []).map((b) => b.question_id))

  const items: PracticeSessionItem[] = []
  for (const row of aq.data ?? []) {
    const question = safe.get(row.question_id)
    if (!question) continue
    const answer = answerByQuestion.get(row.question_id)
    items.push({
      position: row.position,
      question,
      answered: !!answer,
      reveal: answer
        ? buildReveal(row.question_id, keys.get(row.question_id), explanations.get(row.question_id), {
            selectedOptionId: answer.selected_option_id,
            responseText: answer.response_text,
            isCorrect: answer.is_correct,
          })
        : null,
      bookmarked: bookmarked.has(row.question_id),
    })
  }

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      mode: attempt.practice_mode ?? 'custom',
      practiceSetId: attempt.practice_set_id,
      subjectId: attempt.subject_id,
      domainId: attempt.domain_id,
      skillId: attempt.skill_id,
      difficulty: attempt.difficulty,
      totalQuestions: attempt.total_questions,
      answeredCount: attempt.answered_count,
      correctCount: attempt.correct_count,
      timeSpentSeconds: attempt.time_spent_seconds,
      startedAt: attempt.started_at,
      completedAt: attempt.completed_at,
      deadlineAt: attempt.deadline_at,
    },
    items,
  }
}

// ---------------------------------------------------------------------------
// Answer (server-scored, idempotent: the first answer locks)
// ---------------------------------------------------------------------------

/** Recompute counters from stored answers (no read-modify-write on the attempt row). */
export async function recomputePracticeCounters(admin: Db, attemptId: string, userId: string) {
  const { data, error } = await admin.from('attempt_answers').select('is_correct, time_spent_seconds').eq('attempt_id', attemptId).eq('user_id', userId)
  if (error) throw error
  const counters = countersFromAnswers((data ?? []).map((r) => ({ isCorrect: r.is_correct, timeSpentSeconds: r.time_spent_seconds, answered: true })))
  return counters
}

export type PracticeAnswerResult = {
  isCorrect: boolean
  reveal: RevealedAnswer
  alreadyAnswered: boolean
  usage: { used: number; limit: number | null } | null
  /** Attempt counters recomputed from stored, server-scored answers. */
  progress: { answeredCount: number; correctCount: number }
}

const SPR_MESSAGES: Record<string, string> = {
  empty: 'Enter an answer first.',
  too_long: 'Too long: up to 5 characters (6 with a minus sign).',
  invalid: 'Enter a number, decimal or fraction such as 12, .75 or 3/4.',
  mixed_number: 'Mixed numbers are not accepted. Enter 3 1/2 as 7/2 or 3.5.',
  division_by_zero: 'The denominator cannot be zero.',
}

export async function answerPractice(admin: Db, profile: CurrentProfile, input: PracticeAnswerInput): Promise<PracticeAnswerResult> {
  const attempt = await loadOwnedAttempt(admin, profile.id, input.attemptId, 'practice')
  if (!attempt) throw new ApiError(404, 'NOT_FOUND', 'Session not found.')

  const { data: aq, error: aqError } = await admin
    .from('attempt_questions')
    .select('id, question_id')
    .eq('attempt_id', attempt.id)
    .eq('question_id', input.questionId)
    .maybeSingle()
  if (aqError) throw aqError
  if (!aq) throw new ApiError(400, 'VALIDATION_FAILED', 'This question is not part of this session.', { reason: 'not_assigned' })

  const reveal = async (row: { selected_option_id: string | null; response_text: string | null; is_correct: boolean | null }) => {
    const [keys, explanations] = await Promise.all([
      loadAnswerKeys(admin, [aq.question_id]),
      loadExplanations(admin, [aq.question_id], profile.locale),
    ])
    return buildReveal(aq.question_id, keys.get(aq.question_id), explanations.get(aq.question_id), {
      selectedOptionId: row.selected_option_id,
      responseText: row.response_text,
      isCorrect: row.is_correct,
    })
  }

  // Idempotent: an answered question returns its stored result, whatever is submitted now.
  const existing = await admin
    .from('attempt_answers')
    .select('selected_option_id, response_text, is_correct')
    .eq('attempt_question_id', aq.id)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (existing.error) throw existing.error
  const progress = async () => {
    const c = await recomputePracticeCounters(admin, attempt.id, profile.id)
    return { answeredCount: c.answeredCount, correctCount: c.correctCount }
  }
  if (existing.data) {
    return { isCorrect: existing.data.is_correct === true, reveal: await reveal(existing.data), alreadyAnswered: true, usage: null, progress: await progress() }
  }

  if (attempt.status !== 'in_progress') {
    throw new ApiError(409, 'CONFLICT', 'This practice session is finished.', { reason: 'session_finished' })
  }
  if (isPastDeadline(attempt)) {
    await finishPractice(admin, profile, attempt.id)
    throw new ApiError(409, 'TIME_EXPIRED', 'Time is up. Your drill has been submitted.', { reason: 'time_expired', attemptId: attempt.id })
  }

  // A question that is part of a running diagnostic or mock exam must not be revealed here.
  const locked = await lockedQuestionIds(admin, profile.id)
  if (locked.has(aq.question_id)) {
    throw new ApiError(409, 'CONFLICT', 'This question is part of a test you have in progress. Finish the test first.', {
      reason: 'locked_by_test',
    })
  }

  const safe = (await loadSafeQuestions(admin, [aq.question_id])).get(aq.question_id)
  if (!safe) throw new ApiError(404, 'NOT_FOUND', 'Question not found.')

  let selectedOptionId: string | null = null
  let responseText: string | null = null
  if (safe.questionType === 'multiple_choice') {
    if (!optionBelongsToQuestion(safe, input.selectedOptionId)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Choose one of the answer options.', { reason: 'invalid_option' })
    }
    selectedOptionId = input.selectedOptionId!
  } else {
    const parsed = parseSprResponse(input.responseText)
    if (!parsed.ok) {
      throw new ApiError(400, 'VALIDATION_FAILED', SPR_MESSAGES[parsed.reason] ?? SPR_MESSAGES.invalid!, { reason: `spr_${parsed.reason}` })
    }
    responseText = (input.responseText ?? '').trim()
  }

  const { used, limit } = await assertWithinLimit(profile.id, 'practice_questions_daily', profile.timezone, 1)

  const keys = await loadAnswerKeys(admin, [aq.question_id])
  const key = keys.get(aq.question_id)
  if (!key) throw new ApiError(409, 'CONFLICT', 'This question cannot be scored right now.', { reason: 'unscorable' })
  const isCorrect = scoreAnswer(key, { selectedOptionId, responseText })
  const timeSpent = clampTimeSpent(input.timeSpentSeconds, { elapsedSinceStartSeconds: secondsBetween(attempt.started_at) })

  const { error: insertError } = await admin.from('attempt_answers').insert({
    attempt_id: attempt.id,
    attempt_question_id: aq.id,
    question_id: aq.question_id,
    user_id: profile.id,
    selected_option_id: selectedOptionId,
    response_text: responseText,
    is_correct: isCorrect,
    time_spent_seconds: timeSpent,
    answered_at: new Date().toISOString(),
  })
  if (insertError) {
    if (isUniqueViolation(insertError)) {
      // A concurrent request answered first: its answer is the one that counts.
      const { data: stored, error } = await admin
        .from('attempt_answers')
        .select('selected_option_id, response_text, is_correct')
        .eq('attempt_question_id', aq.id)
        .eq('user_id', profile.id)
        .single()
      if (error) throw error
      return { isCorrect: stored.is_correct === true, reveal: await reveal(stored), alreadyAnswered: true, usage: null, progress: await progress() }
    }
    throw insertError
  }

  const counters = await recomputePracticeCounters(admin, attempt.id, profile.id)
  const { error: updateError } = await admin
    .from('attempts')
    .update({ answered_count: counters.answeredCount, correct_count: counters.correctCount, time_spent_seconds: counters.timeSpentSeconds })
    .eq('id', attempt.id)
    .eq('user_id', profile.id)
  if (updateError) console.error('[practice] failed to update counters', updateError)

  await recordActivity(profile.id, profile.timezone, { questions: 1, correct: isCorrect ? 1 : 0, studySeconds: timeSpent })

  return {
    isCorrect,
    reveal: await reveal({ selected_option_id: selectedOptionId, response_text: responseText, is_correct: isCorrect }),
    alreadyAnswered: false,
    usage: { used: used + 1, limit },
    progress: { answeredCount: counters.answeredCount, correctCount: counters.correctCount },
  }
}

// ---------------------------------------------------------------------------
// Finish
// ---------------------------------------------------------------------------


export async function finishPractice(admin: Db, profile: CurrentProfile, attemptId: string): Promise<{ attemptId: string; status: string }> {
  const attempt = await loadOwnedAttempt(admin, profile.id, attemptId, 'practice')
  if (!attempt) throw new ApiError(404, 'NOT_FOUND', 'Session not found.')
  if (attempt.status !== 'in_progress') return { attemptId: attempt.id, status: attempt.status }

  const counters = await recomputePracticeCounters(admin, attempt.id, profile.id)
  const { error } = await admin
    .from('attempts')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      answered_count: counters.answeredCount,
      correct_count: counters.correctCount,
      time_spent_seconds: counters.timeSpentSeconds,
    })
    .eq('id', attempt.id)
    .eq('user_id', profile.id)
    .eq('status', 'in_progress')
  if (error) throw error
  return { attemptId: attempt.id, status: 'completed' }
}
