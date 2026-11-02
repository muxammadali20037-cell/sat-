import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import { addDays, localDate } from '@/lib/time'
import { getTaxonomy } from '@/features/taxonomy/server'
import { getEntitlements } from '@/features/entitlements/server'
import { estimatePoints, type Range } from '@/features/dashboard/logic'
import type { SubjectCode } from '@/types/questions'
import {
  averageTimeBySubject,
  dailySeries,
  rollupByDomain,
  rollupBySubject,
  skillStats,
  tally,
  totals,
  type DailyPoint,
  type SkillPerfRow,
  type SkillStat,
  type Tally,
} from './aggregate'

export type DiagnosticHistoryItem = {
  attemptId: string
  completedAt: string
  title: string | null
  correct: number
  total: number
  domains: Array<{ id: string; name: string; subjectCode: SubjectCode; accuracy: number; level: 'foundation' | 'developing' | 'proficient' | 'advanced' }>
}

export type MockHistoryItem = {
  attemptId: string
  completedAt: string
  title: string | null
  rw: Range | null
  math: Range | null
  total: Range | null
}

export type FullAnalytics = {
  daily: DailyPoint[]
  domains: Array<{ id: string; name: string; subjectCode: SubjectCode; tally: Tally }>
  skills: SkillStat[]
  timeBySubject: Array<{ code: SubjectCode; count: number; avgSeconds: number }>
  diagnostics: DiagnosticHistoryItem[]
  mocks: MockHistoryItem[]
}

export type AnalyticsData = {
  today: string
  hasAnyData: boolean
  fullEnabled: boolean
  scored: Tally
  studySeconds: number
  bySubject: Array<{ code: SubjectCode; tally: Tally }>
  full: FullAnalytics | null
}

const LEVELS = new Set(['foundation', 'developing', 'proficient', 'advanced'])

/**
 * Analytics for the signed-in student. Basic metrics for every plan; the detailed part only when
 * the plan includes `analytics_full`. User-scoped client throughout, except the time-per-question
 * read, which needs each answer's subject from `questions` (no student grant) and therefore uses
 * the service role filtered by the authorized user's id.
 */
export async function loadAnalytics(db: Db, admin: () => Db, profile: CurrentProfile): Promise<AnalyticsData> {
  const userId = profile.id
  const today = localDate(profile.timezone || 'Asia/Tashkent')
  const [taxonomy, ent, perfRes, activityRes] = await Promise.all([
    getTaxonomy(db),
    getEntitlements(userId),
    db.rpc('my_skill_performance'),
    db.from('user_daily_activity').select('activity_date, study_seconds, questions_answered, correct_answers').eq('user_id', userId),
  ])
  if (perfRes.error) throw perfRes.error
  if (activityRes.error) throw activityRes.error
  const perf = (perfRes.data ?? []) as SkillPerfRow[]
  const activity = activityRes.data

  const scored = totals(perf)
  const studySeconds = activity.reduce((s, r) => s + r.study_seconds, 0)
  const subjectTallies = rollupBySubject(perf)
  const bySubject = taxonomy.subjects.map((s) => ({ code: s.code, tally: subjectTallies.get(s.id) ?? tally(0, 0) }))
  const fullEnabled = ent.features.analytics_full.enabled

  let full: FullAnalytics | null = null
  if (fullEnabled) {
    const start = addDays(today, -29)
    const [timeRes, diagRes, mockRes] = await Promise.all([
      admin()
        .from('attempt_answers')
        .select('time_spent_seconds, questions(subject_id)')
        .eq('user_id', userId)
        .not('answered_at', 'is', null)
        .gt('time_spent_seconds', 0)
        .order('answered_at', { ascending: false })
        .limit(2000),
      db
        .from('diagnostic_results')
        .select('attempt_id, domain_id, correct_count, total_count, accuracy, level, attempts!inner(completed_at, status, diagnostic_tests(title))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      db
        .from('attempts')
        .select('id, kind, completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high, mock_exams(title)')
        .eq('user_id', userId)
        .eq('kind', 'mock_exam')
        .eq('status', 'completed')
        .order('completed_at', { ascending: true })
        .limit(100),
    ])
    if (timeRes.error) throw timeRes.error
    if (diagRes.error) throw diagRes.error
    if (mockRes.error) throw mockRes.error

    // Daily (last 30 local days)
    const daily = dailySeries(
      activity.filter((r) => r.activity_date >= start && r.activity_date <= today),
      start,
      today,
    )

    // Domains and skills
    const domainTallies = rollupByDomain(perf)
    const domains = taxonomy.domains.map((d) => ({
      id: d.id,
      name: d.name,
      subjectCode: taxonomy.subjectById.get(d.subjectId)?.code ?? 'math',
      tally: domainTallies.get(d.id) ?? tally(0, 0),
    }))
    const skills = skillStats(perf, taxonomy)

    // Time per question by subject
    const timeRows = timeRes.data
      .map((r) => {
        const q = r.questions as { subject_id: string } | null
        return q ? { subjectId: q.subject_id, seconds: r.time_spent_seconds } : null
      })
      .filter((x): x is { subjectId: string; seconds: number } => x !== null)
    const avg = averageTimeBySubject(timeRows)
    const timeBySubject = taxonomy.subjects
      .map((s) => ({ code: s.code, ...(avg.get(s.id) ?? { count: 0, avgSeconds: 0 }) }))
      .filter((x) => x.count > 0)

    // Diagnostic history (grouped per attempt)
    const byAttempt = new Map<string, DiagnosticHistoryItem>()
    for (const row of diagRes.data) {
      const attempt = row.attempts as { completed_at: string | null; status: string; diagnostic_tests: { title: string } | null } | null
      if (!attempt?.completed_at) continue
      let item = byAttempt.get(row.attempt_id)
      if (!item) {
        item = { attemptId: row.attempt_id, completedAt: attempt.completed_at, title: attempt.diagnostic_tests?.title ?? null, correct: 0, total: 0, domains: [] }
        byAttempt.set(row.attempt_id, item)
      }
      const domain = taxonomy.domainById.get(row.domain_id)
      item.correct += row.correct_count
      item.total += row.total_count
      item.domains.push({
        id: row.domain_id,
        name: domain?.name ?? '',
        subjectCode: domain ? (taxonomy.subjectById.get(domain.subjectId)?.code ?? 'math') : 'math',
        accuracy: Number(row.accuracy),
        level: (LEVELS.has(row.level) ? row.level : 'foundation') as DiagnosticHistoryItem['domains'][number]['level'],
      })
    }
    const domainOrder = new Map(taxonomy.domains.map((d, i) => [d.id, (taxonomy.subjectById.get(d.subjectId)?.position ?? 0) * 100 + i]))
    const diagnostics = [...byAttempt.values()]
      .map((d) => ({ ...d, domains: d.domains.sort((a, b) => (domainOrder.get(a.id) ?? 0) - (domainOrder.get(b.id) ?? 0)) }))
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))

    // Mock exam estimates
    const titles = new Map(mockRes.data.map((r) => [r.id, (r.mock_exams as { title: string } | null)?.title ?? null]))
    const mocks = estimatePoints(mockRes.data).map((p) => ({
      attemptId: p.attemptId,
      completedAt: p.completedAt,
      title: titles.get(p.attemptId) ?? null,
      rw: p.rw,
      math: p.math,
      total: p.total,
    }))

    full = { daily, domains, skills, timeBySubject, diagnostics, mocks }
  }

  return {
    today,
    hasAnyData: scored.answered > 0 || studySeconds > 0,
    fullEnabled,
    scored,
    studySeconds,
    bySubject,
    full,
  }
}
