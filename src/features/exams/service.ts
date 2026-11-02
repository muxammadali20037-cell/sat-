import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { Tables } from '@/types/database'
import { ApiError, notFoundError } from '@/lib/api/errors'
import { scoreAnswer } from '@/lib/scoring'
import { loadAnswerKeys, loadSafeQuestions } from '@/features/questions/server'
import { toTimedQuestion } from '@/types/questions'
import { assertWithinLimit } from '@/features/entitlements/server'
import { recordActivity } from '@/features/activity/server'
import {
  DEFAULT_ANSWER_GRACE_SECONDS,
  answerGate,
  computeResults,
  deadlineFrom,
  derivePhase,
  isFinalStatus,
  modulesToExpire,
  nextStep,
  sortModules,
  submissionTime,
  type AttemptStatus,
  type ExamRules,
  type ExamSection,
  type ModuleRuntime,
  type ModuleVariant,
  type NextStep,
} from './machine'
import type { SaveAnswerInput } from './schemas'
import type { ExamStateDTO, SaveAnswerResultDTO, SavedAnswerDTO, StartExamResultDTO } from './types'

/**
 * Mock exam engine (server-authoritative). Every function takes the SERVICE-ROLE client and the
 * already-authenticated user id; ownership is checked here on every call. State is derived only
 * from persisted rows, so refreshing the browser can never change time or score.
 */

type Ctx = { admin: Db; userId: string; timeZone: string; now?: Date }
type AttemptRow = Pick<Tables<'attempts'>, 'id' | 'user_id' | 'status' | 'mock_exam_id'>
type ExamRow = Tables<'mock_exams'>

const MODULE_COLUMNS =
  'id, section, module_number, variant, status, sequence, duration_seconds, started_at, deadline_at, submitted_at, total_questions, correct_count'

type ModuleRow = Pick<
  Tables<'attempt_modules'>,
  | 'id'
  | 'section'
  | 'module_number'
  | 'variant'
  | 'status'
  | 'sequence'
  | 'duration_seconds'
  | 'started_at'
  | 'deadline_at'
  | 'submitted_at'
  | 'total_questions'
  | 'correct_count'
>

function toRuntime(row: ModuleRow): ModuleRuntime {
  return {
    id: row.id,
    sequence: row.sequence,
    section: row.section as ExamSection,
    moduleNumber: row.module_number === 2 ? 2 : 1,
    variant: row.variant as ModuleVariant,
    status: row.status as ModuleRuntime['status'],
    durationSeconds: row.duration_seconds,
    startedAt: row.started_at,
    deadlineAt: row.deadline_at,
    submittedAt: row.submitted_at,
    totalQuestions: row.total_questions,
    correctCount: row.correct_count,
  }
}

const rulesOf = (exam: ExamRow): ExamRules => ({
  isAdaptive: exam.is_adaptive,
  routingThreshold: Number(exam.routing_threshold),
  breakSeconds: exam.break_seconds,
})

const isUniqueViolation = (error: { code?: string } | null) => error?.code === '23505'

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

let graceCache: { value: number; at: number } | null = null

/** platform_settings 'exams.answer_grace_seconds' (default 5, clamped 0–60), cached for a minute. */
export async function getAnswerGraceSeconds(admin: Db): Promise<number> {
  if (graceCache && Date.now() - graceCache.at < 60_000) return graceCache.value
  let value = DEFAULT_ANSWER_GRACE_SECONDS
  const { data } = await admin.from('platform_settings').select('value').eq('key', 'exams.answer_grace_seconds').maybeSingle()
  const parsed = Number(data?.value)
  if (data && Number.isFinite(parsed)) value = Math.min(60, Math.max(0, parsed))
  graceCache = { value, at: Date.now() }
  return value
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadOwnedAttempt(admin: Db, attemptId: string, userId: string): Promise<AttemptRow & { mock_exam_id: string }> {
  const { data, error } = await admin
    .from('attempts')
    .select('id, user_id, status, mock_exam_id')
    .eq('id', attemptId)
    .eq('user_id', userId)
    .eq('kind', 'mock_exam')
    .maybeSingle()
  if (error) throw error
  if (!data || !data.mock_exam_id) throw notFoundError('Exam attempt')
  return { ...data, mock_exam_id: data.mock_exam_id }
}

async function loadExam(admin: Db, examId: string): Promise<ExamRow> {
  const { data, error } = await admin.from('mock_exams').select('*').eq('id', examId).maybeSingle()
  if (error) throw error
  if (!data) throw notFoundError('Mock exam')
  return data
}

async function loadModules(admin: Db, attemptId: string): Promise<ModuleRuntime[]> {
  const { data, error } = await admin.from('attempt_modules').select(MODULE_COLUMNS).eq('attempt_id', attemptId).order('sequence')
  if (error) throw error
  return data.map(toRuntime)
}

async function reloadAttemptStatus(admin: Db, attemptId: string): Promise<AttemptStatus> {
  const { data, error } = await admin.from('attempts').select('status').eq('id', attemptId).single()
  if (error) throw error
  return data.status as AttemptStatus
}

// ---------------------------------------------------------------------------
// Transitions (each is idempotent and safe under concurrent requests)
// ---------------------------------------------------------------------------

/** Scores every answer of a module from persisted rows and stores is_correct + counts. Idempotent. */
export async function scoreModule(admin: Db, attemptModuleId: string): Promise<number> {
  const { data: aqs, error } = await admin.from('attempt_questions').select('id, question_id').eq('attempt_module_id', attemptModuleId)
  if (error) throw error
  let correct = 0
  if (aqs.length > 0) {
    const { data: answers, error: aErr } = await admin
      .from('attempt_answers')
      .select('id, attempt_question_id, question_id, selected_option_id, response_text, is_correct')
      .in(
        'attempt_question_id',
        aqs.map((q) => q.id),
      )
    if (aErr) throw aErr
    const keys = await loadAnswerKeys(
      admin,
      aqs.map((q) => q.question_id),
    )
    const toTrue: string[] = []
    const toFalse: string[] = []
    for (const a of answers) {
      const key = keys.get(a.question_id)
      const isCorrect = key ? scoreAnswer(key, { selectedOptionId: a.selected_option_id, responseText: a.response_text }) : false
      if (isCorrect) correct += 1
      if (a.is_correct !== isCorrect) (isCorrect ? toTrue : toFalse).push(a.id)
    }
    if (toTrue.length > 0) {
      const { error: e } = await admin.from('attempt_answers').update({ is_correct: true }).in('id', toTrue)
      if (e) throw e
    }
    if (toFalse.length > 0) {
      const { error: e } = await admin.from('attempt_answers').update({ is_correct: false }).in('id', toFalse)
      if (e) throw e
    }
  }
  const { error: mErr } = await admin
    .from('attempt_modules')
    .update({ correct_count: correct, total_questions: aqs.length })
    .eq('id', attemptModuleId)
  if (mErr) throw mErr
  return correct
}

/** in_progress → submitted|expired (conditional; only the request that claims it scores). */
async function finalizeModule(admin: Db, module: ModuleRuntime, reason: 'submitted' | 'expired', now: Date): Promise<boolean> {
  const { data, error } = await admin
    .from('attempt_modules')
    .update({ status: reason, submitted_at: submissionTime(module, reason, now) })
    .eq('id', module.id)
    .eq('status', 'in_progress')
    .select('id')
  if (error) throw error
  if (data.length === 0) return false
  await scoreModule(admin, module.id)
  return true
}

async function createAttemptModule(admin: Db, attemptId: string, exam: ExamRow, step: Extract<NextStep, { kind: 'create_module' }>) {
  const { data: mod, error } = await admin
    .from('mock_exam_modules')
    .select('id, duration_seconds')
    .eq('mock_exam_id', exam.id)
    .eq('section', step.slot.section)
    .eq('module_number', step.slot.moduleNumber)
    .eq('variant', step.variant)
    .maybeSingle()
  if (error) throw error
  if (!mod) throw new ApiError(409, 'CONFLICT', 'This exam is missing a module. Please try another exam.')
  const { error: insErr } = await admin.from('attempt_modules').insert({
    attempt_id: attemptId,
    module_id: mod.id,
    section: step.slot.section,
    module_number: step.slot.moduleNumber,
    variant: step.variant,
    status: 'ready',
    sequence: step.slot.sequence,
    duration_seconds: mod.duration_seconds,
  })
  if (insErr && !isUniqueViolation(insErr)) throw insErr
}

/**
 * Writes the attempt's final aggregates and unofficial estimates. With `claim`, the conditional
 * status update makes exactly one request complete the attempt and record activity; without it
 * (late-answer repair), it only refreshes the numbers of an already completed attempt.
 */
async function writeAttemptResults(admin: Db, attempt: AttemptRow, modules: ModuleRuntime[], ctx: Ctx, claim: boolean) {
  const results = computeResults(modules)
  const { count, error: cErr } = await admin
    .from('attempt_answers')
    .select('id', { count: 'exact', head: true })
    .eq('attempt_id', attempt.id)
    .or('selected_option_id.not.is.null,response_text.not.is.null')
  if (cErr) throw cErr
  const answered = count ?? 0
  const patch = {
    total_questions: results.totalQuestions,
    answered_count: answered,
    correct_count: results.correct,
    time_spent_seconds: results.secondsUsed,
    rw_estimate_low: results.sections.reading_writing?.estimate.low ?? null,
    rw_estimate_high: results.sections.reading_writing?.estimate.high ?? null,
    math_estimate_low: results.sections.math?.estimate.low ?? null,
    math_estimate_high: results.sections.math?.estimate.high ?? null,
  }
  if (!claim) {
    const { error } = await admin.from('attempts').update(patch).eq('id', attempt.id).eq('status', 'completed')
    if (error) throw error
    return
  }
  const { data, error } = await admin
    .from('attempts')
    .update({ ...patch, status: 'completed', completed_at: (ctx.now ?? new Date()).toISOString() })
    .eq('id', attempt.id)
    .eq('status', 'in_progress')
    .select('id')
  if (error) throw error
  if (data.length > 0) {
    await recordActivity(attempt.user_id, ctx.timeZone, { questions: answered, correct: results.correct, studySeconds: results.secondsUsed })
  }
}

/**
 * Lazy expiry + progression. Finalizes any module past deadline + grace, creates the next module
 * (adaptive routing), and completes the attempt after the last module. Loops until stable.
 */
async function settle(ctx: Ctx, attempt: AttemptRow, exam: ExamRow): Promise<{ status: AttemptStatus; modules: ModuleRuntime[] }> {
  const { admin } = ctx
  const now = ctx.now ?? new Date()
  const grace = await getAnswerGraceSeconds(admin)
  let status = attempt.status as AttemptStatus
  for (let i = 0; i < 12; i++) {
    const modules = await loadModules(admin, attempt.id)
    const expired = status === 'in_progress' ? modulesToExpire(modules, now, grace) : []
    if (expired.length > 0) {
      for (const m of expired) await finalizeModule(admin, m, 'expired', now)
      continue
    }
    const step = nextStep(status, modules, rulesOf(exam))
    switch (step.kind) {
      case 'wait':
      case 'done':
        return { status, modules }
      case 'score_module':
        await scoreModule(admin, step.moduleId)
        break
      case 'create_module':
        await createAttemptModule(admin, attempt.id, exam, step)
        break
      case 'finalize_attempt':
        await writeAttemptResults(admin, attempt, modules, ctx, true)
        status = await reloadAttemptStatus(admin, attempt.id)
        break
    }
  }
  throw new Error(`[exams] attempt ${attempt.id} did not settle`)
}

// ---------------------------------------------------------------------------
// State payload
// ---------------------------------------------------------------------------

async function buildState(ctx: Ctx, attempt: AttemptRow, exam: ExamRow, status: AttemptStatus, modules: ModuleRuntime[]): Promise<ExamStateDTO> {
  const { admin } = ctx
  const now = new Date()
  const derived = derivePhase(status, modules, rulesOf(exam), ctx.now ?? now)
  const summary = sortModules(modules).map((m) => ({
    id: m.id,
    sequence: m.sequence,
    section: m.section,
    moduleNumber: m.moduleNumber,
    status: m.status,
    durationSeconds: m.durationSeconds,
    totalQuestions: m.totalQuestions,
  }))

  let next: ExamStateDTO['next'] = null
  if (derived.next) {
    const nm = derived.next
    const { data: source } = await admin.from('attempt_modules').select('module_id').eq('id', nm.id).single()
    let questionCount = nm.totalQuestions
    if (source) {
      const { count } = await admin.from('mock_exam_questions').select('id', { count: 'exact', head: true }).eq('module_id', source.module_id)
      questionCount = count ?? questionCount
    }
    next = { ...summary.find((s) => s.id === nm.id)!, questionCount, autoBegin: derived.autoBegin }
  }

  let current: ExamStateDTO['current'] = null
  if (derived.current && derived.current.startedAt && derived.current.deadlineAt) {
    const cm = derived.current
    const { data: aqs, error } = await admin
      .from('attempt_questions')
      .select('id, question_id, position')
      .eq('attempt_module_id', cm.id)
      .order('position')
    if (error) throw error
    const safe = await loadSafeQuestions(
      admin,
      aqs.map((q) => q.question_id),
    )
    // Deliberately NOT selecting is_correct: nothing about correctness leaves the server mid-test.
    const { data: rows, error: aErr } = aqs.length
      ? await admin
          .from('attempt_answers')
          .select('attempt_question_id, selected_option_id, response_text, marked_for_review, time_spent_seconds')
          .in(
            'attempt_question_id',
            aqs.map((q) => q.id),
          )
      : { data: [], error: null }
    if (aErr) throw aErr
    const answers: Record<string, SavedAnswerDTO> = {}
    for (const r of rows ?? []) {
      answers[r.attempt_question_id] = {
        selectedOptionId: r.selected_option_id,
        responseText: r.response_text,
        markedForReview: r.marked_for_review,
        timeSpentSeconds: r.time_spent_seconds,
      }
    }
    current = {
      attemptModuleId: cm.id,
      sequence: cm.sequence,
      section: cm.section,
      moduleNumber: cm.moduleNumber,
      startedAt: cm.startedAt!,
      deadlineAt: cm.deadlineAt!,
      questions: aqs
        .filter((q) => safe.has(q.question_id))
        .map((q, i) => ({ attemptQuestionId: q.id, position: i + 1, question: toTimedQuestion(safe.get(q.question_id)!) })),
      answers,
    }
  }

  return {
    attemptId: attempt.id,
    exam: { id: exam.id, title: exam.title, isAdaptive: exam.is_adaptive, isFullLength: exam.is_full_length, breakSeconds: exam.break_seconds },
    phase: derived.phase,
    serverNow: new Date().toISOString(),
    modules: summary,
    next,
    breakEndsAt: derived.breakEndsAt,
    current,
  }
}

// ---------------------------------------------------------------------------
// Public API (used by /api/exams/*)
// ---------------------------------------------------------------------------

async function findActiveAttempt(admin: Db, userId: string, examId: string): Promise<AttemptRow | null> {
  const { data, error } = await admin
    .from('attempts')
    .select('id, user_id, status, mock_exam_id')
    .eq('user_id', userId)
    .eq('kind', 'mock_exam')
    .eq('mock_exam_id', examId)
    .eq('status', 'in_progress')
    .maybeSingle()
  if (error) throw error
  return data
}

/** Resume the in-progress attempt for this exam, or start a new one (counts against the monthly limit). */
export async function startExam(ctx: Ctx & { mockExamId: string }): Promise<StartExamResultDTO> {
  const { admin, userId, mockExamId } = ctx
  const { data: exam, error } = await admin.from('mock_exams').select('*').eq('id', mockExamId).maybeSingle()
  if (error) throw error
  if (!exam) throw notFoundError('Mock exam')

  const active = await findActiveAttempt(admin, userId, mockExamId)
  if (active) {
    await settle(ctx, active, exam)
    return { attemptId: active.id, resumed: true }
  }
  if (exam.status !== 'published') throw notFoundError('Mock exam')

  await assertWithinLimit(userId, 'mock_exams_monthly', ctx.timeZone, 1)

  const { data: created, error: insErr } = await admin
    .from('attempts')
    .insert({ user_id: userId, kind: 'mock_exam', mock_exam_id: mockExamId, status: 'in_progress' })
    .select('id, user_id, status, mock_exam_id')
    .single()
  if (insErr) {
    if (isUniqueViolation(insErr)) {
      const raced = await findActiveAttempt(admin, userId, mockExamId)
      if (raced) return { attemptId: raced.id, resumed: true }
    }
    throw insErr
  }
  await settle(ctx, created, exam)
  return { attemptId: created.id, resumed: false }
}

export async function getExamState(ctx: Ctx & { attemptId: string }): Promise<ExamStateDTO> {
  const attempt = await loadOwnedAttempt(ctx.admin, ctx.attemptId, ctx.userId)
  const exam = await loadExam(ctx.admin, attempt.mock_exam_id)
  const { status, modules } = await settle(ctx, attempt, exam)
  return buildState(ctx, attempt, exam, status, modules)
}

/** Starts the timer of the given ready module and fixes its question list. Idempotent. */
export async function beginModule(ctx: Ctx & { attemptId: string; attemptModuleId: string }): Promise<ExamStateDTO> {
  const { admin } = ctx
  const attempt = await loadOwnedAttempt(admin, ctx.attemptId, ctx.userId)
  const exam = await loadExam(admin, attempt.mock_exam_id)
  let { status, modules } = await settle(ctx, attempt, exam)
  if (status !== 'in_progress') return buildState(ctx, attempt, exam, status, modules)

  const target = modules.find((m) => m.id === ctx.attemptModuleId)
  if (!target) throw notFoundError('Module')
  const running = modules.find((m) => m.status === 'in_progress')
  if (running && running.id !== target.id) throw new ApiError(409, 'CONFLICT', 'Another module is already in progress.')

  if (target.status === 'ready') {
    const { data: source, error: sErr } = await admin.from('attempt_modules').select('module_id').eq('id', target.id).single()
    if (sErr) throw sErr
    const { data: mq, error: qErr } = await admin
      .from('mock_exam_questions')
      .select('question_id, position')
      .eq('module_id', source.module_id)
      .order('position')
    if (qErr) throw qErr
    if (mq.length === 0) throw new ApiError(409, 'CONFLICT', 'This module has no questions yet. Please try another exam.')

    // Fix the question list first (idempotent), then start the clock (conditional).
    const { error: aqErr } = await admin.from('attempt_questions').upsert(
      mq.map((q, i) => ({ attempt_id: attempt.id, attempt_module_id: target.id, question_id: q.question_id, position: i + 1 })),
      { onConflict: 'attempt_id,question_id', ignoreDuplicates: true },
    )
    if (aqErr) throw aqErr
    const start = new Date()
    const { error: uErr } = await admin
      .from('attempt_modules')
      .update({
        status: 'in_progress',
        started_at: start.toISOString(),
        deadline_at: deadlineFrom(start, target.durationSeconds).toISOString(),
        total_questions: mq.length,
      })
      .eq('id', target.id)
      .eq('status', 'ready')
    if (uErr) throw uErr
    ;({ status, modules } = await settle(ctx, attempt, exam))
  }
  return buildState(ctx, attempt, exam, status, modules)
}

/** Saves one answer of the current in-progress module (rejected after deadline + grace). */
export async function saveAnswer(ctx: Ctx & { input: SaveAnswerInput }): Promise<SaveAnswerResultDTO> {
  const { admin, input } = ctx
  const attempt = await loadOwnedAttempt(admin, input.attemptId, ctx.userId)
  if (attempt.status !== 'in_progress') throw new ApiError(409, 'TIME_EXPIRED', 'This exam has already finished.')
  const exam = await loadExam(admin, attempt.mock_exam_id)
  const { modules } = await settle(ctx, attempt, exam)

  const { data: aq, error } = await admin
    .from('attempt_questions')
    .select('id, attempt_module_id, question_id')
    .eq('id', input.attemptQuestionId)
    .eq('attempt_id', attempt.id)
    .maybeSingle()
  if (error) throw error
  if (!aq || !aq.attempt_module_id) throw notFoundError('Question')

  const active = modules.find((m) => m.id === aq.attempt_module_id)
  const now = ctx.now ?? new Date()
  const gate = answerGate(active, now, await getAnswerGraceSeconds(admin))
  if (!gate.ok) {
    throw gate.code === 'TIME_EXPIRED'
      ? new ApiError(409, 'TIME_EXPIRED', 'Time is up for this module. Your saved answers were submitted.')
      : new ApiError(409, 'CONFLICT', 'This question is not part of the module in progress.')
  }

  const { data: question, error: qErr } = await admin
    .from('questions')
    .select('question_type, answer_options(id)')
    .eq('id', aq.question_id)
    .single()
  if (qErr) throw qErr
  let selectedOptionId: string | null = null
  let responseText: string | null = null
  if (question.question_type === 'multiple_choice') {
    if (input.responseText !== null) throw new ApiError(400, 'VALIDATION_FAILED', 'Choose one of the options for this question.')
    if (input.selectedOptionId !== null) {
      if (!(question.answer_options ?? []).some((o) => o.id === input.selectedOptionId)) {
        throw new ApiError(400, 'VALIDATION_FAILED', 'That option does not belong to this question.')
      }
      selectedOptionId = input.selectedOptionId
    }
  } else {
    if (input.selectedOptionId !== null) throw new ApiError(400, 'VALIDATION_FAILED', 'Enter your answer in the box for this question.')
    responseText = input.responseText
  }

  const answeredAt = selectedOptionId || responseText ? now.toISOString() : null
  const { error: upErr } = await admin.from('attempt_answers').upsert(
    {
      attempt_id: attempt.id,
      attempt_question_id: aq.id,
      question_id: aq.question_id,
      user_id: ctx.userId,
      selected_option_id: selectedOptionId,
      response_text: responseText,
      is_correct: null,
      marked_for_review: input.markedForReview,
      time_spent_seconds: Math.min(input.timeSpentSeconds, active!.durationSeconds),
      answered_at: answeredAt,
    },
    { onConflict: 'attempt_question_id' },
  )
  if (upErr) throw upErr

  // Race guard: if the module was finalized between our gate check and the write, the answer was
  // sent in time but missed scoring. Re-score so it is never left with is_correct = NULL.
  const { data: after } = await admin.from('attempt_modules').select('status').eq('id', active!.id).single()
  if (after && isFinalStatus(after.status as ModuleRuntime['status'])) {
    await scoreModule(admin, active!.id)
    const status = await reloadAttemptStatus(admin, attempt.id)
    if (status === 'completed') await writeAttemptResults(admin, attempt, await loadModules(admin, attempt.id), ctx, false)
  }

  return { savedAt: now.toISOString(), serverNow: new Date().toISOString(), deadlineAt: active!.deadlineAt! }
}

/** Submits the given module (idempotent: an already finalized module just returns the state). */
export async function submitModule(ctx: Ctx & { attemptId: string; attemptModuleId: string }): Promise<ExamStateDTO> {
  const { admin } = ctx
  const attempt = await loadOwnedAttempt(admin, ctx.attemptId, ctx.userId)
  const exam = await loadExam(admin, attempt.mock_exam_id)
  let { status, modules } = await settle(ctx, attempt, exam)
  const target = modules.find((m) => m.id === ctx.attemptModuleId)
  if (!target) throw notFoundError('Module')
  if (target.status === 'ready') throw new ApiError(409, 'CONFLICT', 'This module has not started yet.')
  if (target.status === 'in_progress') {
    await finalizeModule(admin, target, 'submitted', ctx.now ?? new Date())
    ;({ status, modules } = await settle(ctx, attempt, exam))
  }
  return buildState(ctx, attempt, exam, status, modules)
}
