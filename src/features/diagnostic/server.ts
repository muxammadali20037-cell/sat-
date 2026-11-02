import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import type { Tables } from '@/types/database'
import type { SafeQuestion, SubjectCode } from '@/types/questions'
import { ApiError } from '@/lib/api/errors'
import { levelFromAccuracy, scoreAnswer } from '@/lib/scoring'
import { getTaxonomy, type DomainRow } from '@/features/taxonomy/server'
import { loadAnswerKeys, loadSafeQuestions, optionBelongsToQuestion } from '@/features/questions/server'
import { requireFeature } from '@/features/entitlements/server'
import { recordActivity } from '@/features/activity/server'
import { fetchAllPages, getNumberSetting, isUniqueViolation, loadAnswerHistory, lockedQuestionIds } from '@/features/practice/queries'
import { loadOwnedAttempt } from '@/features/practice/server'
import { secondsBetween } from '@/features/practice/timing'
import { composeDiagnostic, type DiagnosticCandidate } from './compose'
import { DEFAULT_ANSWER_GRACE_SECONDS, type DiagnosticAnswerInput } from './schemas'

type Attempt = Tables<'attempts'>
type DiagnosticTest = Pick<Tables<'diagnostic_tests'>, 'id' | 'slug' | 'title' | 'description' | 'subject_scope' | 'questions_per_domain' | 'duration_seconds'>

export type SubjectScope = 'math' | 'reading_writing' | 'both'

export function scopeSubjects(scope: string): SubjectCode[] {
  if (scope === 'math') return ['math']
  if (scope === 'reading_writing') return ['reading_writing']
  return ['math', 'reading_writing']
}

/** Domains of a scope in official order (subject, then domain position). */
export async function domainsInScope(admin: Db, scope: string): Promise<DomainRow[]> {
  const taxonomy = await getTaxonomy(admin)
  const subjects = scopeSubjects(scope)
    .map((code) => taxonomy.subjectByCode.get(code))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => a.position - b.position)
  return subjects.flatMap((s) => taxonomy.domains.filter((d) => d.subjectId === s.id).sort((a, b) => a.position - b.position))
}

export async function getGraceSeconds(admin: Db): Promise<number> {
  return getNumberSetting(admin, 'exams.answer_grace_seconds', DEFAULT_ANSWER_GRACE_SECONDS, { min: 0, max: 120 })
}

export function isPastDeadline(attempt: Pick<Attempt, 'deadline_at'>, graceSeconds: number, now = new Date()): boolean {
  if (!attempt.deadline_at) return false
  return now.getTime() > new Date(attempt.deadline_at).getTime() + graceSeconds * 1000
}

/** Published question counts per domain (for "ready" indicators on the diagnostic list). */
export async function publishedCountsByDomain(admin: Db): Promise<Map<string, number>> {
  const rows = await fetchAllPages(
    (from, to) => admin.from('questions').select('domain_id').eq('status', 'published').order('id').range(from, to),
    { max: 20_000 },
  )
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.domain_id, (counts.get(r.domain_id) ?? 0) + 1)
  return counts
}

async function loadPublishedTest(admin: Db, id: string): Promise<DiagnosticTest | null> {
  const { data, error } = await admin
    .from('diagnostic_tests')
    .select('id, slug, title, description, subject_scope, questions_per_domain, duration_seconds')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()
  if (error) throw error
  return data
}

async function findInProgress(admin: Db, userId: string, testId: string): Promise<Attempt | null> {
  const { data, error } = await admin
    .from('attempts')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'diagnostic')
    .eq('diagnostic_test_id', testId)
    .eq('status', 'in_progress')
    .maybeSingle()
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Start / resume
// ---------------------------------------------------------------------------

export async function startDiagnostic(
  admin: Db,
  profile: CurrentProfile,
  diagnosticTestId: string,
): Promise<{ attemptId: string; resumed: boolean; deadlineAt: string | null }> {
  await requireFeature(profile.id, 'diagnostic')
  const test = await loadPublishedTest(admin, diagnosticTestId)
  if (!test) throw new ApiError(404, 'NOT_FOUND', 'Diagnostic not found.')

  const grace = await getGraceSeconds(admin)
  const existing = await findInProgress(admin, profile.id, test.id)
  if (existing) {
    if (!isPastDeadline(existing, grace)) return { attemptId: existing.id, resumed: true, deadlineAt: existing.deadline_at }
    // Lazy expiry: close the timed-out attempt, then start a fresh one.
    await finalizeDiagnostic(admin, profile, existing.id)
  }

  const domains = await domainsInScope(admin, test.subject_scope)
  const [rows, history, locked] = await Promise.all([
    fetchAllPages<{ id: string; domain_id: string; skill_id: string; difficulty: string }>(
      (from, to) =>
        admin
          .from('questions')
          .select('id, domain_id, skill_id, difficulty')
          .eq('status', 'published')
          .in('domain_id', domains.map((d) => d.id))
          .order('id')
          .range(from, to),
      { max: 20_000 },
    ),
    loadAnswerHistory(admin, profile.id),
    lockedQuestionIds(admin, profile.id),
  ])
  const all: DiagnosticCandidate[] = rows
    .filter((r) => r.difficulty === 'easy' || r.difficulty === 'medium' || r.difficulty === 'hard')
    .map((r) => ({ id: r.id, domainId: r.domain_id, skillId: r.skill_id, difficulty: r.difficulty as DiagnosticCandidate['difficulty'] }))
  const domainList = domains.map((d) => ({ domainId: d.id, name: d.name }))

  // Questions of another running timed test are excluded so that finishing one test can never
  // reveal answers to a question that is still open in another.
  let composed = composeDiagnostic({
    domains: domainList,
    candidates: all.filter((c) => !locked.has(c.id)),
    perDomain: test.questions_per_domain,
    history,
  })
  if (!composed.ok && locked.size > 0) {
    const unrestricted = composeDiagnostic({ domains: domainList, candidates: all, perDomain: test.questions_per_domain, history })
    if (unrestricted.ok) {
      throw new ApiError(409, 'CONFLICT', 'Finish the test you have in progress before starting this diagnostic.', { reason: 'other_test_in_progress' })
    }
    composed = unrestricted
  }
  if (!composed.ok) {
    const domainName = composed.reason === 'not_enough_questions' ? composed.domainName : ''
    throw new ApiError(409, 'CONFLICT', `The diagnostic isn't ready yet: not enough published questions in ${domainName || 'this scope'}.`, {
      reason: 'not_ready',
      domain: domainName,
    })
  }

  const taxonomy = await getTaxonomy(admin)
  const scopeSubject = test.subject_scope === 'both' ? null : (taxonomy.subjectByCode.get(test.subject_scope as SubjectCode)?.id ?? null)
  const deadline = new Date(Date.now() + test.duration_seconds * 1000)
  const { data: attempt, error } = await admin
    .from('attempts')
    .insert({
      user_id: profile.id,
      kind: 'diagnostic',
      status: 'in_progress',
      diagnostic_test_id: test.id,
      subject_id: scopeSubject,
      difficulty: 'mixed',
      total_questions: composed.questionIds.length,
      deadline_at: deadline.toISOString(),
    })
    .select('id, deadline_at')
    .single()
  if (error) {
    if (isUniqueViolation(error)) {
      // Another request started this diagnostic at the same moment: resume that one.
      const raced = await findInProgress(admin, profile.id, test.id)
      if (raced) return { attemptId: raced.id, resumed: true, deadlineAt: raced.deadline_at }
    }
    throw error
  }

  const { error: aqError } = await admin
    .from('attempt_questions')
    .insert(composed.questionIds.map((questionId, i) => ({ attempt_id: attempt.id, question_id: questionId, position: i + 1 })))
  if (aqError) {
    await admin.from('attempts').delete().eq('id', attempt.id).eq('user_id', profile.id)
    throw aqError
  }
  return { attemptId: attempt.id, resumed: false, deadlineAt: attempt.deadline_at }
}

// ---------------------------------------------------------------------------
// Runner state (no answer keys, no correctness)
// ---------------------------------------------------------------------------

export type DiagnosticItem = {
  position: number
  question: SafeQuestion
  selectedOptionId: string | null
  responseText: string | null
  markedForReview: boolean
}

export type DiagnosticState = {
  attempt: {
    id: string
    status: string
    title: string
    scope: string
    startedAt: string
    deadlineAt: string | null
    durationSeconds: number
    totalQuestions: number
  }
  serverNow: string
  items: DiagnosticItem[]
}

export async function loadDiagnosticState(admin: Db, profile: CurrentProfile, attempt: Attempt): Promise<DiagnosticState> {
  if (attempt.user_id !== profile.id || attempt.kind !== 'diagnostic') throw new Error('loadDiagnosticState: not an owned diagnostic')
  const [aq, answers, test] = await Promise.all([
    admin.from('attempt_questions').select('question_id, position').eq('attempt_id', attempt.id).order('position'),
    // NOTE: is_correct is deliberately not selected.
    admin
      .from('attempt_answers')
      .select('question_id, selected_option_id, response_text, marked_for_review')
      .eq('attempt_id', attempt.id)
      .eq('user_id', profile.id),
    admin.from('diagnostic_tests').select('title, subject_scope, duration_seconds').eq('id', attempt.diagnostic_test_id!).maybeSingle(),
  ])
  if (aq.error) throw aq.error
  if (answers.error) throw answers.error
  if (test.error) throw test.error

  const safe = await loadSafeQuestions(admin, (aq.data ?? []).map((r) => r.question_id))
  const byQuestion = new Map((answers.data ?? []).map((a) => [a.question_id, a]))
  const items: DiagnosticItem[] = []
  for (const row of aq.data ?? []) {
    const question = safe.get(row.question_id)
    if (!question) continue
    const a = byQuestion.get(row.question_id)
    items.push({
      position: row.position,
      question,
      selectedOptionId: a?.selected_option_id ?? null,
      responseText: a?.response_text ?? null,
      markedForReview: a?.marked_for_review ?? false,
    })
  }
  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      title: test.data?.title ?? '',
      scope: test.data?.subject_scope ?? 'both',
      startedAt: attempt.started_at,
      deadlineAt: attempt.deadline_at,
      durationSeconds: test.data?.duration_seconds ?? 0,
      totalQuestions: attempt.total_questions,
    },
    serverNow: new Date().toISOString(),
    items,
  }
}

// ---------------------------------------------------------------------------
// Save answer (no feedback; is_correct stays NULL until finalization)
// ---------------------------------------------------------------------------

export type DiagnosticSaveResult = {
  questionId: string
  selectedOptionId: string | null
  responseText: string | null
  markedForReview: boolean
  answeredCount: number
  serverNow: string
  deadlineAt: string | null
}

export async function saveDiagnosticAnswer(admin: Db, profile: CurrentProfile, input: DiagnosticAnswerInput): Promise<DiagnosticSaveResult> {
  const attempt = await loadOwnedAttempt(admin, profile.id, input.attemptId, 'diagnostic')
  if (!attempt) throw new ApiError(404, 'NOT_FOUND', 'Diagnostic not found.')
  if (attempt.status !== 'in_progress') {
    throw new ApiError(409, 'CONFLICT', 'This diagnostic is already finished.', { reason: 'finished', attemptId: attempt.id })
  }
  const grace = await getGraceSeconds(admin)
  if (isPastDeadline(attempt, grace)) {
    await finalizeDiagnostic(admin, profile, attempt.id)
    throw new ApiError(409, 'TIME_EXPIRED', 'Time is up. Your diagnostic has been submitted.', { reason: 'time_expired', attemptId: attempt.id })
  }

  const { data: aq, error: aqError } = await admin
    .from('attempt_questions')
    .select('id, question_id')
    .eq('attempt_id', attempt.id)
    .eq('question_id', input.questionId)
    .maybeSingle()
  if (aqError) throw aqError
  if (!aq) throw new ApiError(400, 'VALIDATION_FAILED', 'This question is not part of this diagnostic.', { reason: 'not_assigned' })

  const safe = (await loadSafeQuestions(admin, [aq.question_id])).get(aq.question_id)
  if (!safe) throw new ApiError(404, 'NOT_FOUND', 'Question not found.')
  if (input.selectedOptionId) {
    if (safe.questionType !== 'multiple_choice' || !optionBelongsToQuestion(safe, input.selectedOptionId)) {
      throw new ApiError(400, 'VALIDATION_FAILED', 'Choose one of the answer options.', { reason: 'invalid_option' })
    }
  }
  if (input.responseText && safe.questionType !== 'student_produced_response') {
    throw new ApiError(400, 'VALIDATION_FAILED', 'This question needs one of the answer options.', { reason: 'invalid_option' })
  }

  const { data: existing, error: exError } = await admin
    .from('attempt_answers')
    .select('selected_option_id, response_text, marked_for_review, answered_at')
    .eq('attempt_question_id', aq.id)
    .eq('user_id', profile.id)
    .maybeSingle()
  if (exError) throw exError

  const selectedOptionId = input.selectedOptionId !== undefined ? input.selectedOptionId : (existing?.selected_option_id ?? null)
  const trimmed = input.responseText !== undefined ? (input.responseText ?? '').trim() : null
  const responseText = input.responseText !== undefined ? (trimmed ? trimmed : null) : (existing?.response_text ?? null)
  const markedForReview = input.markedForReview !== undefined ? input.markedForReview : (existing?.marked_for_review ?? false)
  const hasAnswer = !!selectedOptionId || !!responseText
  const answerChanged = input.selectedOptionId !== undefined || input.responseText !== undefined

  const { error: upsertError } = await admin.from('attempt_answers').upsert(
    {
      attempt_id: attempt.id,
      attempt_question_id: aq.id,
      question_id: aq.question_id,
      user_id: profile.id,
      selected_option_id: selectedOptionId,
      response_text: responseText,
      marked_for_review: markedForReview,
      is_correct: null,
      answered_at: hasAnswer ? (answerChanged ? new Date().toISOString() : (existing?.answered_at ?? new Date().toISOString())) : null,
    },
    { onConflict: 'attempt_question_id' },
  )
  if (upsertError) throw upsertError

  const { count, error: countError } = await admin
    .from('attempt_answers')
    .select('id', { count: 'exact', head: true })
    .eq('attempt_id', attempt.id)
    .eq('user_id', profile.id)
    .or('selected_option_id.not.is.null,response_text.not.is.null')
  if (countError) throw countError
  const answeredCount = count ?? 0
  const { data: stillOpen, error: updateError } = await admin
    .from('attempts')
    .update({ answered_count: answeredCount })
    .eq('id', attempt.id)
    .eq('user_id', profile.id)
    .eq('status', 'in_progress')
    .select('id')
    .maybeSingle()
  if (updateError) throw updateError
  if (!stillOpen) {
    // The diagnostic was finalized while this save was in flight: make sure scoring covers the
    // row we just wrote (its is_correct was reset to NULL by the upsert), then report it.
    const latest = await loadOwnedAttempt(admin, profile.id, attempt.id, 'diagnostic')
    if (latest) await ensureDiagnosticScored(admin, latest)
    throw new ApiError(409, 'CONFLICT', 'This diagnostic is already finished.', { reason: 'finished', attemptId: attempt.id })
  }

  return {
    questionId: aq.question_id,
    selectedOptionId,
    responseText,
    markedForReview,
    answeredCount,
    serverNow: new Date().toISOString(),
    deadlineAt: attempt.deadline_at,
  }
}

// ---------------------------------------------------------------------------
// Finalization (idempotent, two-phase)
// ---------------------------------------------------------------------------

/**
 * Scores every assigned question and writes diagnostic_results. Idempotent and deterministic:
 * safe to run again (self-healing) if a previous finalization stopped half-way.
 *
 * Decision: unanswered questions get an attempt_answers row with is_correct = false and
 * answered_at = NULL (no selected option / response). Every assigned question is therefore
 * scored, and `skill_performance()` reflects the diagnostic rule "unanswered = incorrect".
 */
export async function scoreDiagnostic(admin: Db, attempt: Attempt): Promise<{ answered: number; correct: number }> {
  const [aq, answers] = await Promise.all([
    admin.from('attempt_questions').select('id, question_id').eq('attempt_id', attempt.id),
    admin
      .from('attempt_answers')
      .select('attempt_question_id, selected_option_id, response_text, marked_for_review')
      .eq('attempt_id', attempt.id)
      .eq('user_id', attempt.user_id),
  ])
  if (aq.error) throw aq.error
  if (answers.error) throw answers.error
  const rows = aq.data ?? []
  if (rows.length === 0) return { answered: 0, correct: 0 }

  const questionIds = rows.map((r) => r.question_id)
  const [keys, meta] = await Promise.all([
    loadAnswerKeys(admin, questionIds),
    admin.from('questions').select('id, domain_id').in('id', questionIds),
  ])
  if (meta.error) throw meta.error
  const domainOf = new Map((meta.data ?? []).map((q) => [q.id, q.domain_id]))
  const answerByAq = new Map((answers.data ?? []).map((a) => [a.attempt_question_id, a]))

  let answered = 0
  let correct = 0
  const perDomain = new Map<string, { correct: number; total: number }>()
  const upserts = rows.map((row) => {
    const a = answerByAq.get(row.id)
    const hasAnswer = !!a && (!!a.selected_option_id || !!a.response_text)
    const key = keys.get(row.question_id)
    const isCorrect = hasAnswer && key ? scoreAnswer(key, { selectedOptionId: a!.selected_option_id, responseText: a!.response_text }) : false
    if (hasAnswer) answered++
    if (isCorrect) correct++
    const domainId = domainOf.get(row.question_id)
    if (domainId) {
      const d = perDomain.get(domainId) ?? { correct: 0, total: 0 }
      d.total++
      if (isCorrect) d.correct++
      perDomain.set(domainId, d)
    }
    return {
      attempt_id: attempt.id,
      attempt_question_id: row.id,
      question_id: row.question_id,
      user_id: attempt.user_id,
      is_correct: isCorrect,
    }
  })

  const { error: upsertError } = await admin.from('attempt_answers').upsert(upserts, { onConflict: 'attempt_question_id' })
  if (upsertError) throw upsertError

  const results = [...perDomain.entries()]
    .filter(([, d]) => d.total > 0)
    .map(([domainId, d]) => {
      const accuracy = d.correct / d.total
      return {
        attempt_id: attempt.id,
        user_id: attempt.user_id,
        domain_id: domainId,
        correct_count: d.correct,
        total_count: d.total,
        accuracy: Math.round(accuracy * 10_000) / 10_000,
        level: levelFromAccuracy(accuracy),
      }
    })
  if (results.length > 0) {
    const { error } = await admin.from('diagnostic_results').upsert(results, { onConflict: 'attempt_id,domain_id' })
    if (error) throw error
  }

  const { error: updateError } = await admin
    .from('attempts')
    .update({ answered_count: answered, correct_count: Math.min(correct, attempt.total_questions) })
    .eq('id', attempt.id)
    .eq('user_id', attempt.user_id)
  if (updateError) throw updateError
  return { answered, correct }
}

/**
 * Finish a diagnostic: (1) atomically claim it (`status = 'in_progress'` → `completed`), which
 * makes every later answer save fail; (2) score and write results. Calling it again is a no-op
 * apart from re-running the idempotent scoring when results are missing.
 */
export async function finalizeDiagnostic(admin: Db, profile: CurrentProfile, attemptId: string): Promise<Attempt | null> {
  const attempt = await loadOwnedAttempt(admin, profile.id, attemptId, 'diagnostic')
  if (!attempt) return null

  let current = attempt
  let claimed = false
  if (attempt.status === 'in_progress') {
    const now = new Date()
    const deadline = attempt.deadline_at ? new Date(attempt.deadline_at) : null
    const completedAt = deadline && now > deadline ? deadline : now
    const { data, error } = await admin
      .from('attempts')
      .update({
        status: 'completed',
        completed_at: completedAt.toISOString(),
        time_spent_seconds: secondsBetween(attempt.started_at, completedAt),
      })
      .eq('id', attempt.id)
      .eq('user_id', profile.id)
      .eq('status', 'in_progress')
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (data) {
      claimed = true
      current = data
    } else {
      current = (await loadOwnedAttempt(admin, profile.id, attempt.id, 'diagnostic')) ?? attempt
    }
  }
  if (current.status !== 'completed' && current.status !== 'expired') return current

  if (claimed) {
    const { answered, correct } = await scoreDiagnostic(admin, current)
    await recordActivity(profile.id, profile.timezone, { questions: answered, correct, studySeconds: current.time_spent_seconds })
  } else {
    await ensureDiagnosticScored(admin, current)
  }
  return (await loadOwnedAttempt(admin, profile.id, current.id, 'diagnostic')) ?? current
}

/** Self-heal: re-run scoring for a finished diagnostic whose results were never written. */
export async function ensureDiagnosticScored(admin: Db, attempt: Attempt): Promise<void> {
  if (attempt.kind !== 'diagnostic' || (attempt.status !== 'completed' && attempt.status !== 'expired')) return
  const [{ count: results, error }, { count: unscored, error: e2 }] = await Promise.all([
    admin.from('diagnostic_results').select('id', { count: 'exact', head: true }).eq('attempt_id', attempt.id).eq('user_id', attempt.user_id),
    admin.from('attempt_answers').select('id', { count: 'exact', head: true }).eq('attempt_id', attempt.id).is('is_correct', null),
  ])
  if (error) throw error
  if (e2) throw e2
  if ((results ?? 0) === 0 || (unscored ?? 0) > 0) await scoreDiagnostic(admin, attempt)
}

/** Lazily finalize any of the student's diagnostics whose time ran out. */
export async function finalizeExpiredDiagnostics(admin: Db, profile: CurrentProfile): Promise<void> {
  const { data, error } = await admin
    .from('attempts')
    .select('id, deadline_at')
    .eq('user_id', profile.id)
    .eq('kind', 'diagnostic')
    .eq('status', 'in_progress')
  if (error) throw error
  const grace = await getGraceSeconds(admin)
  for (const a of data ?? []) {
    if (isPastDeadline(a, grace)) await finalizeDiagnostic(admin, profile, a.id)
  }
}

export type DiagnosticResultRow = {
  domainId: string
  domainName: string
  subjectId: string
  correct: number
  total: number
  accuracy: number
  level: 'foundation' | 'developing' | 'proficient' | 'advanced'
}

export async function loadDiagnosticResults(admin: Db, userId: string, attemptId: string): Promise<DiagnosticResultRow[]> {
  const [{ data, error }, taxonomy] = await Promise.all([
    admin
      .from('diagnostic_results')
      .select('domain_id, correct_count, total_count, accuracy, level')
      .eq('attempt_id', attemptId)
      .eq('user_id', userId),
    getTaxonomy(admin),
  ])
  if (error) throw error
  const order = (domainId: string) => {
    const domain = taxonomy.domainById.get(domainId)
    return (taxonomy.subjectById.get(domain?.subjectId ?? '')?.position ?? 9) * 100 + (domain?.position ?? 99)
  }
  return (data ?? [])
    .slice()
    .sort((a, b) => order(a.domain_id) - order(b.domain_id))
    .map((r): DiagnosticResultRow => {
      const domain = taxonomy.domainById.get(r.domain_id)
      return {
        domainId: r.domain_id,
        domainName: domain?.name ?? '',
        subjectId: domain?.subjectId ?? '',
        correct: r.correct_count,
        total: r.total_count,
        accuracy: Number(r.accuracy),
        level: r.level as DiagnosticResultRow['level'],
      }
    })
}
