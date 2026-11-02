import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { Locale } from '@/lib/i18n/config'
import type { RevealedAnswer, SafeQuestion } from '@/types/questions'
import { buildReveal, loadAnswerKeys, loadExplanations, loadSafeQuestions } from '@/features/questions/server'
import { getTaxonomy } from '@/features/taxonomy/server'
import { SECTIONS, sortModules, type AttemptModuleStatus, type ExamSection, type ModuleVariant } from './machine'

/**
 * Read models for the student pages. All take the SERVICE-ROLE client and must only be called
 * after the page authorized the user; every user-data read is filtered by that user's id.
 */

export type SectionStructure = {
  section: ExamSection
  module1: { questions: number; minutes: number }
  module2: { minQuestions: number; maxQuestions: number; minutes: number }
}
export type ExamStructure = { sections: SectionStructure[]; totalQuestions: number; totalMinutes: number }

type ModuleWithCount = { id: string; section: string; module_number: number; variant: string; duration_seconds: number; count: number }

async function moduleCounts(admin: Db, examIds: string[]): Promise<Map<string, ModuleWithCount[]>> {
  const out = new Map<string, ModuleWithCount[]>()
  if (examIds.length === 0) return out
  const { data: modules, error } = await admin
    .from('mock_exam_modules')
    .select('id, mock_exam_id, section, module_number, variant, duration_seconds')
    .in('mock_exam_id', examIds)
  if (error) throw error
  const counts = new Map<string, number>()
  if (modules.length > 0) {
    const { data: rows, error: qErr } = await admin
      .from('mock_exam_questions')
      .select('module_id')
      .in(
        'module_id',
        modules.map((m) => m.id),
      )
    if (qErr) throw qErr
    for (const r of rows) counts.set(r.module_id, (counts.get(r.module_id) ?? 0) + 1)
  }
  for (const m of modules) {
    out.set(m.mock_exam_id, [...(out.get(m.mock_exam_id) ?? []), { ...m, count: counts.get(m.id) ?? 0 }])
  }
  return out
}

export function structureOf(modules: ModuleWithCount[]): ExamStructure {
  const sections: SectionStructure[] = []
  for (const section of SECTIONS) {
    const m1 = modules.find((m) => m.section === section && m.module_number === 1)
    const m2s = modules.filter((m) => m.section === section && m.module_number === 2)
    if (!m1 || m2s.length === 0) continue
    const m2Counts = m2s.map((m) => m.count)
    sections.push({
      section,
      module1: { questions: m1.count, minutes: Math.round(m1.duration_seconds / 60) },
      module2: {
        minQuestions: Math.min(...m2Counts),
        maxQuestions: Math.max(...m2Counts),
        minutes: Math.round(Math.max(...m2s.map((m) => m.duration_seconds)) / 60),
      },
    })
  }
  return {
    sections,
    totalQuestions: sections.reduce((s, x) => s + x.module1.questions + x.module2.maxQuestions, 0),
    totalMinutes: sections.reduce((s, x) => s + x.module1.minutes + x.module2.minutes, 0),
  }
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

export type StudentAttemptSummary = {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  totalLow: number | null
  totalHigh: number | null
}
export type StudentExamListItem = {
  id: string
  title: string
  description: string
  isAdaptive: boolean
  isFullLength: boolean
  breakSeconds: number
  structure: ExamStructure
  active: StudentAttemptSummary | null
  completed: StudentAttemptSummary[]
}

const totalRange = (a: { rw_estimate_low: number | null; rw_estimate_high: number | null; math_estimate_low: number | null; math_estimate_high: number | null }) =>
  a.rw_estimate_low !== null && a.math_estimate_low !== null && a.rw_estimate_high !== null && a.math_estimate_high !== null
    ? { low: a.rw_estimate_low + a.math_estimate_low, high: a.rw_estimate_high + a.math_estimate_high }
    : { low: null, high: null }

export async function listExamsForStudent(admin: Db, userId: string): Promise<StudentExamListItem[]> {
  const { data: exams, error } = await admin
    .from('mock_exams')
    .select('id, title, description, is_adaptive, is_full_length, break_seconds, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: true })
  if (error) throw error

  const { data: attempts, error: aErr } = await admin
    .from('attempts')
    .select('id, mock_exam_id, status, started_at, completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high')
    .eq('user_id', userId)
    .eq('kind', 'mock_exam')
    .in('status', ['in_progress', 'completed'])
    .order('started_at', { ascending: false })
  if (aErr) throw aErr

  const counts = await moduleCounts(
    admin,
    exams.map((e) => e.id),
  )
  return exams.map((e) => {
    const mine = attempts.filter((a) => a.mock_exam_id === e.id)
    const toSummary = (a: (typeof mine)[number]): StudentAttemptSummary => {
      const r = totalRange(a)
      return { id: a.id, status: a.status, startedAt: a.started_at, completedAt: a.completed_at, totalLow: r.low, totalHigh: r.high }
    }
    const active = mine.find((a) => a.status === 'in_progress')
    return {
      id: e.id,
      title: e.title,
      description: e.description,
      isAdaptive: e.is_adaptive,
      isFullLength: e.is_full_length,
      breakSeconds: e.break_seconds,
      structure: structureOf(counts.get(e.id) ?? []),
      active: active ? toSummary(active) : null,
      completed: mine.filter((a) => a.status === 'completed').map(toSummary),
    }
  })
}

// ---------------------------------------------------------------------------
// Runner page
// ---------------------------------------------------------------------------

export type ExamOverview = {
  id: string
  title: string
  description: string
  status: string
  isAdaptive: boolean
  isFullLength: boolean
  breakSeconds: number
  routingThreshold: number
  structure: ExamStructure
  activeAttemptId: string | null
  lastCompletedAttemptId: string | null
}

/** Null when the exam does not exist, or is unpublished and the student has no attempt to resume. */
export async function getExamOverview(admin: Db, examId: string, userId: string): Promise<ExamOverview | null> {
  const { data: exam, error } = await admin
    .from('mock_exams')
    .select('id, title, description, status, is_adaptive, is_full_length, break_seconds, routing_threshold')
    .eq('id', examId)
    .maybeSingle()
  if (error) throw error
  if (!exam) return null
  const { data: attempts, error: aErr } = await admin
    .from('attempts')
    .select('id, status, completed_at')
    .eq('user_id', userId)
    .eq('kind', 'mock_exam')
    .eq('mock_exam_id', examId)
    .in('status', ['in_progress', 'completed'])
    .order('started_at', { ascending: false })
  if (aErr) throw aErr
  const active = attempts.find((a) => a.status === 'in_progress') ?? null
  if (exam.status !== 'published' && !active) return null
  const counts = await moduleCounts(admin, [exam.id])
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    status: exam.status,
    isAdaptive: exam.is_adaptive,
    isFullLength: exam.is_full_length,
    breakSeconds: exam.break_seconds,
    routingThreshold: Number(exam.routing_threshold),
    structure: structureOf(counts.get(exam.id) ?? []),
    activeAttemptId: active?.id ?? null,
    lastCompletedAttemptId: attempts.find((a) => a.status === 'completed')?.id ?? null,
  }
}

// ---------------------------------------------------------------------------
// Results page
// ---------------------------------------------------------------------------

export type ResultQuestion = {
  attemptQuestionId: string
  position: number
  question: SafeQuestion
  reveal: RevealedAnswer
  answered: boolean
  markedForReview: boolean
}
export type ResultModule = {
  id: string
  sequence: number
  section: ExamSection
  moduleNumber: 1 | 2
  variant: ModuleVariant
  status: AttemptModuleStatus
  correct: number
  total: number
  questions: ResultQuestion[]
}
export type DomainBreakdown = { domainId: string; name: string; section: ExamSection; correct: number; total: number }
export type ExamResults = {
  attemptId: string
  exam: { id: string; title: string; isAdaptive: boolean; isFullLength: boolean; routingThreshold: number }
  completedAt: string
  timeSpentSeconds: number
  correct: number
  totalQuestions: number
  answered: number
  estimates: {
    reading_writing: { low: number; high: number } | null
    math: { low: number; high: number } | null
    total: { low: number; high: number } | null
  }
  modules: ResultModule[]
  domains: DomainBreakdown[]
}

export type ResultsLookup = { kind: 'ok'; results: ExamResults } | { kind: 'in_progress'; mockExamId: string } | { kind: 'not_found' }

export async function getExamResults(admin: Db, attemptId: string, userId: string, locale: Locale): Promise<ResultsLookup> {
  const { data: attempt, error } = await admin
    .from('attempts')
    .select(
      'id, user_id, status, mock_exam_id, completed_at, time_spent_seconds, correct_count, total_questions, answered_count, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high',
    )
    .eq('id', attemptId)
    .eq('user_id', userId) // ownership
    .eq('kind', 'mock_exam')
    .maybeSingle()
  if (error) throw error
  if (!attempt || !attempt.mock_exam_id) return { kind: 'not_found' }
  if (attempt.status === 'in_progress') return { kind: 'in_progress', mockExamId: attempt.mock_exam_id }
  if (attempt.status !== 'completed') return { kind: 'not_found' }

  const [{ data: exam, error: eErr }, { data: modules, error: mErr }] = await Promise.all([
    admin.from('mock_exams').select('id, title, is_adaptive, is_full_length, routing_threshold').eq('id', attempt.mock_exam_id).single(),
    admin
      .from('attempt_modules')
      .select('id, section, module_number, variant, status, sequence, total_questions, correct_count')
      .eq('attempt_id', attempt.id)
      .order('sequence'),
  ])
  if (eErr) throw eErr
  if (mErr) throw mErr

  const { data: aqs, error: qErr } = await admin
    .from('attempt_questions')
    .select('id, attempt_module_id, question_id, position')
    .eq('attempt_id', attempt.id)
    .order('position')
  if (qErr) throw qErr
  const { data: answers, error: ansErr } = await admin
    .from('attempt_answers')
    .select('attempt_question_id, selected_option_id, response_text, is_correct, marked_for_review')
    .eq('attempt_id', attempt.id)
    .eq('user_id', userId)
  if (ansErr) throw ansErr

  const questionIds = aqs.map((q) => q.question_id)
  // The attempt is completed: keys and explanations may now be revealed to its owner.
  const [safe, keys, explanations, taxonomy] = await Promise.all([
    loadSafeQuestions(admin, questionIds),
    loadAnswerKeys(admin, questionIds),
    loadExplanations(admin, questionIds, locale),
    getTaxonomy(admin),
  ])
  const answerByAq = new Map(answers.map((a) => [a.attempt_question_id, a]))

  const domainStats = new Map<string, DomainBreakdown>()
  const resultModules: ResultModule[] = sortModules(modules).map((m) => {
    const section = m.section as ExamSection
    const questions = aqs
      .filter((q) => q.attempt_module_id === m.id && safe.has(q.question_id))
      .map((q, i): ResultQuestion => {
        const a = answerByAq.get(q.id)
        const answered = !!(a?.selected_option_id || a?.response_text)
        const isCorrect = answered ? (a?.is_correct ?? false) : false
        const question = safe.get(q.question_id)!
        const domain = domainStats.get(question.domainId) ?? {
          domainId: question.domainId,
          name: question.domainName,
          section,
          correct: 0,
          total: 0,
        }
        domain.total += 1
        if (isCorrect) domain.correct += 1
        domainStats.set(question.domainId, domain)
        return {
          attemptQuestionId: q.id,
          position: i + 1,
          question,
          answered,
          markedForReview: a?.marked_for_review ?? false,
          reveal: buildReveal(q.question_id, keys.get(q.question_id), explanations.get(q.question_id), {
            selectedOptionId: a?.selected_option_id ?? null,
            responseText: a?.response_text ?? null,
            isCorrect,
          }),
        }
      })
    return {
      id: m.id,
      sequence: m.sequence,
      section,
      moduleNumber: m.module_number === 2 ? 2 : 1,
      variant: m.variant as ModuleVariant,
      status: m.status as AttemptModuleStatus,
      correct: m.correct_count ?? 0,
      total: m.total_questions,
      questions,
    }
  })

  const domainOrder = new Map(taxonomy.domains.map((d) => [d.id, d.position]))
  const domains = [...domainStats.values()].sort(
    (a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) || (domainOrder.get(a.domainId) ?? 0) - (domainOrder.get(b.domainId) ?? 0),
  )
  const range = (low: number | null, high: number | null) => (low !== null && high !== null ? { low, high } : null)
  const rw = range(attempt.rw_estimate_low, attempt.rw_estimate_high)
  const math = range(attempt.math_estimate_low, attempt.math_estimate_high)

  return {
    kind: 'ok',
    results: {
      attemptId: attempt.id,
      exam: {
        id: exam.id,
        title: exam.title,
        isAdaptive: exam.is_adaptive,
        isFullLength: exam.is_full_length,
        routingThreshold: Number(exam.routing_threshold),
      },
      completedAt: attempt.completed_at ?? new Date().toISOString(),
      timeSpentSeconds: attempt.time_spent_seconds,
      correct: attempt.correct_count,
      totalQuestions: attempt.total_questions,
      answered: attempt.answered_count,
      estimates: { reading_writing: rw, math, total: rw && math ? { low: rw.low + math.low, high: rw.high + math.high } : null },
      modules: resultModules,
      domains,
    },
  }
}
