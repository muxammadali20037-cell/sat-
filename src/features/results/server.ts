import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import type { Tables } from '@/types/database'
import type { RevealedAnswer, SafeQuestion } from '@/types/questions'
import { getTaxonomy, type Taxonomy } from '@/features/taxonomy/server'
import { buildReveal, loadAnswerKeys, loadExplanations, loadSafeQuestions } from '@/features/questions/server'
import { fetchAllPages, lockedQuestionIds } from '@/features/practice/queries'
import {
  domainBreakdown,
  skillBreakdown,
  summarize,
  weakestSkills,
  type AttemptSummary,
  type CountMode,
  type DomainStat,
  type ScoredItem,
  type SkillStat,
} from './aggregate'

type Attempt = Tables<'attempts'>

export type ReviewItem = {
  position: number
  question: SafeQuestion
  answered: boolean
  markedForReview: boolean
  timeSpentSeconds: number
  /** Present when feedback is allowed: practice → answered questions; diagnostic → all, after completion. */
  reveal: RevealedAnswer | null
}

export type AttemptReport = {
  attempt: Attempt
  mode: CountMode
  summary: AttemptSummary
  skills: SkillStat[]
  domains: DomainStat[]
  weakest: SkillStat[]
  items: ReviewItem[]
  /** False for diagnostics still in progress: no correctness is exposed. */
  feedbackAllowed: boolean
}

/** Stable taxonomy ordering: subject → domain → skill. */
export function taxonomyOrder(taxonomy: Taxonomy, skillId: string): number {
  const skill = taxonomy.skillById.get(skillId)
  const domain = skill ? taxonomy.domainById.get(skill.domainId) : undefined
  const subject = domain ? taxonomy.subjectById.get(domain.subjectId) : undefined
  return (subject?.position ?? 9) * 10_000 + (domain?.position ?? 99) * 100 + (skill?.position ?? 99)
}

/**
 * Full report for an attempt the caller has ALREADY verified belongs to `profile`
 * (pass the row returned by an owner-filtered lookup).
 */
export async function buildAttemptReport(admin: Db, profile: CurrentProfile, attempt: Attempt): Promise<AttemptReport> {
  if (attempt.user_id !== profile.id) throw new Error('buildAttemptReport: attempt does not belong to the profile')
  const mode: CountMode = attempt.kind === 'practice' ? 'answered' : 'assigned'
  const feedbackAllowed = attempt.kind === 'practice' || attempt.status === 'completed' || attempt.status === 'expired'

  const [aq, answers, taxonomy, locked] = await Promise.all([
    fetchAllPages((from, to) =>
      admin.from('attempt_questions').select('question_id, position').eq('attempt_id', attempt.id).order('position').order('id').range(from, to),
    ),
    fetchAllPages((from, to) =>
      admin
        .from('attempt_answers')
        .select('question_id, selected_option_id, response_text, is_correct, marked_for_review, time_spent_seconds, answered_at')
        .eq('attempt_id', attempt.id)
        .eq('user_id', profile.id)
        .order('id')
        .range(from, to),
    ),
    getTaxonomy(admin),
    // Questions in a timed test the student is still taking are never revealed elsewhere.
    lockedQuestionIds(admin, profile.id),
  ])

  const answerByQuestion = new Map(answers.map((a) => [a.question_id, a]))
  const questionIds = aq.map((r) => r.question_id)
  // Practice: reveal answered questions only. Diagnostic/exam: reveal everything after finalization.
  const revealIds = (feedbackAllowed ? (attempt.kind === 'practice' ? questionIds.filter((id) => answerByQuestion.has(id)) : questionIds) : []).filter(
    (id) => !locked.has(id),
  )

  const [safe, keys, explanations] = await Promise.all([
    loadSafeQuestions(admin, questionIds),
    loadAnswerKeys(admin, revealIds),
    loadExplanations(admin, revealIds, profile.locale),
  ])

  const items: ReviewItem[] = []
  const scored: ScoredItem[] = []
  const revealSet = new Set(revealIds)
  for (const row of aq) {
    const question = safe.get(row.question_id)
    if (!question) continue
    const answer = answerByQuestion.get(row.question_id)
    // "Answered" means a real response, not just a review flag on a diagnostic question.
    const answered = !!answer && (attempt.kind === 'practice' || !!answer.selected_option_id || !!answer.response_text)
    const isCorrect = feedbackAllowed ? (answer?.is_correct ?? (attempt.kind === 'practice' ? null : false)) : null
    items.push({
      position: row.position,
      question,
      answered,
      markedForReview: answer?.marked_for_review ?? false,
      timeSpentSeconds: answer?.time_spent_seconds ?? 0,
      reveal: revealSet.has(row.question_id)
        ? buildReveal(row.question_id, keys.get(row.question_id), explanations.get(row.question_id), {
            selectedOptionId: answer?.selected_option_id ?? null,
            responseText: answer?.response_text ?? null,
            isCorrect: answered ? (answer?.is_correct ?? false) : false,
          })
        : null,
    })
    scored.push({
      questionId: row.question_id,
      skillId: question.skillId,
      skillName: question.skillName,
      domainId: question.domainId,
      domainName: question.domainName,
      order: taxonomyOrder(taxonomy, question.skillId),
      answered,
      isCorrect: answered ? isCorrect : feedbackAllowed && attempt.kind !== 'practice' ? false : null,
      timeSpentSeconds: answer?.time_spent_seconds ?? 0,
    })
  }

  const skills = feedbackAllowed ? skillBreakdown(scored, mode) : []
  const domains = feedbackAllowed ? domainBreakdown(scored, mode) : []
  const weights = new Map(taxonomy.domains.map((d) => [d.id, d.weightPercent]))
  const summary = summarize(
    feedbackAllowed ? scored : scored.map((s) => ({ ...s, isCorrect: null })),
    mode,
  )
  if (attempt.kind !== 'practice') summary.timeSpentSeconds = Math.max(summary.timeSpentSeconds, attempt.time_spent_seconds)

  return {
    attempt,
    mode,
    summary,
    skills,
    domains,
    weakest: feedbackAllowed ? weakestSkills(skills, weights, 3) : [],
    items,
    feedbackAllowed,
  }
}

export type AttemptListItem = {
  id: string
  kind: 'practice' | 'diagnostic' | 'mock_exam'
  status: string
  practiceMode: string | null
  title: string
  startedAt: string
  completedAt: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  timeSpentSeconds: number
  mockExamId: string | null
  /** Unofficial estimate range for mock exams (null otherwise). */
  estimate: { low: number; high: number } | null
}

/** The student's attempts, newest first, with display titles. */
export async function listAttempts(
  admin: Db,
  userId: string,
  opts: { kind?: AttemptListItem['kind']; limit?: number; offset?: number; statuses?: string[] } = {},
): Promise<{ items: AttemptListItem[]; total: number }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20))
  const offset = Math.max(0, opts.offset ?? 0)
  let query = admin
    .from('attempts')
    .select(
      'id, kind, status, practice_mode, started_at, completed_at, total_questions, answered_count, correct_count, time_spent_seconds, skill_id, domain_id, subject_id, difficulty, practice_set_id, diagnostic_test_id, mock_exam_id, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high',
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .neq('status', 'abandoned')
    .order('started_at', { ascending: false })
    .order('id')
    .range(offset, offset + limit - 1)
  if (opts.kind) query = query.eq('kind', opts.kind)
  if (opts.statuses) query = query.in('status', opts.statuses)
  const { data, error, count } = await query
  if (error) throw error
  const rows = data ?? []

  const setIds = [...new Set(rows.map((r) => r.practice_set_id).filter((x): x is string => !!x))]
  const diagIds = [...new Set(rows.map((r) => r.diagnostic_test_id).filter((x): x is string => !!x))]
  const mockIds = [...new Set(rows.map((r) => r.mock_exam_id).filter((x): x is string => !!x))]
  const [taxonomy, sets, diags, mocks] = await Promise.all([
    getTaxonomy(admin),
    setIds.length ? admin.from('practice_sets').select('id, title').in('id', setIds) : Promise.resolve({ data: [], error: null }),
    diagIds.length ? admin.from('diagnostic_tests').select('id, title').in('id', diagIds) : Promise.resolve({ data: [], error: null }),
    mockIds.length ? admin.from('mock_exams').select('id, title').in('id', mockIds) : Promise.resolve({ data: [], error: null }),
  ])
  const titles = new Map<string, string>()
  for (const r of [...(sets.data ?? []), ...(diags.data ?? []), ...(mocks.data ?? [])]) titles.set(r.id, r.title)

  const items = rows.map((r): AttemptListItem => {
    let title = ''
    if (r.kind === 'practice') {
      if (r.practice_set_id && titles.has(r.practice_set_id)) title = titles.get(r.practice_set_id)!
      else if (r.skill_id) title = taxonomy.skillById.get(r.skill_id)?.name ?? ''
      else if (r.domain_id) title = taxonomy.domainById.get(r.domain_id)?.name ?? ''
      else if (r.subject_id) title = taxonomy.subjectById.get(r.subject_id)?.name ?? ''
    } else if (r.kind === 'diagnostic') {
      title = (r.diagnostic_test_id && titles.get(r.diagnostic_test_id)) || ''
    } else {
      title = (r.mock_exam_id && titles.get(r.mock_exam_id)) || ''
    }
    const hasEstimate = r.rw_estimate_low !== null || r.math_estimate_low !== null
    return {
      id: r.id,
      kind: r.kind as AttemptListItem['kind'],
      status: r.status,
      practiceMode: r.practice_mode,
      title,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      totalQuestions: r.total_questions,
      answeredCount: r.answered_count,
      correctCount: r.correct_count,
      timeSpentSeconds: r.time_spent_seconds,
      mockExamId: r.mock_exam_id,
      estimate: hasEstimate
        ? { low: (r.rw_estimate_low ?? 0) + (r.math_estimate_low ?? 0), high: (r.rw_estimate_high ?? 0) + (r.math_estimate_high ?? 0) }
        : null,
    }
  })
  return { items, total: count ?? items.length }
}

/** Published lessons that teach any of the given skills (recommended next steps). */
export async function lessonsForSkills(admin: Db, skillIds: string[], limit = 6): Promise<Array<{ id: string; title: string; skillId: string; durationSeconds: number }>> {
  if (skillIds.length === 0) return []
  const { data, error } = await admin
    .from('lessons')
    .select('id, title, skill_id, duration_seconds, position, courses!inner(status)')
    .in('skill_id', skillIds)
    .eq('status', 'published')
    .eq('courses.status', 'published')
    .order('position')
    .limit(50)
  if (error) throw error
  const rank = new Map(skillIds.map((id, i) => [id, i]))
  return (data ?? [])
    .filter((l): l is typeof l & { skill_id: string } => !!l.skill_id)
    .sort((a, b) => (rank.get(a.skill_id) ?? 99) - (rank.get(b.skill_id) ?? 99) || a.position - b.position)
    .slice(0, limit)
    .map((l) => ({ id: l.id, title: l.title, skillId: l.skill_id, durationSeconds: l.duration_seconds }))
}
