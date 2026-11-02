/**
 * Pure dashboard helpers (unit-tested): week strip, exam countdown, score-estimate series,
 * study-plan task links and result links. No I/O.
 */
import { addDays, daysBetween } from '@/lib/time'
import { practiceHref } from '@/features/analytics/aggregate'

// ---------------------------------------------------------------------------
// Streak week strip
// ---------------------------------------------------------------------------

export type ActivityDay = {
  activity_date: string
  study_seconds: number
  questions_answered: number
  lessons_completed: number
}

/** Same rule as SQL public.activity_streak(): answered a question, studied ≥ 60 s, or finished a lesson. */
export function isActiveDay(row: Pick<ActivityDay, 'study_seconds' | 'questions_answered' | 'lessons_completed'>): boolean {
  return row.questions_answered > 0 || row.study_seconds >= 60 || row.lessons_completed > 0
}

export type WeekDay = { date: string; active: boolean; isToday: boolean; isFuture: boolean }

/** Monday → Sunday of the week containing `today` (YYYY-MM-DD, already in the student's zone). */
export function currentWeek(today: string, rows: ActivityDay[]): WeekDay[] {
  const active = new Set(rows.filter(isActiveDay).map((r) => r.activity_date))
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 = Sunday
  const monday = addDays(today, -((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    return { date, active: active.has(date), isToday: date === today, isFuture: date > today }
  })
}

// ---------------------------------------------------------------------------
// Exam countdown
// ---------------------------------------------------------------------------

export type ExamCountdown =
  | { state: 'unset' }
  | { state: 'upcoming'; date: string; days: number; weeks: number }
  | { state: 'today'; date: string }
  | { state: 'passed'; date: string; daysAgo: number }

export function examCountdown(examDate: string | null, today: string): ExamCountdown {
  if (!examDate || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) return { state: 'unset' }
  const days = daysBetween(today, examDate)
  if (days > 0) return { state: 'upcoming', date: examDate, days, weeks: Math.floor(days / 7) }
  if (days === 0) return { state: 'today', date: examDate }
  return { state: 'passed', date: examDate, daysAgo: -days }
}

// ---------------------------------------------------------------------------
// Score estimates (attempt estimate columns; SAT MASTER estimate, not official)
// ---------------------------------------------------------------------------

export type EstimateRow = {
  id: string
  kind: string
  completed_at: string | null
  rw_estimate_low: number | null
  rw_estimate_high: number | null
  math_estimate_low: number | null
  math_estimate_high: number | null
}

export type Range = { low: number; high: number; mid: number }

export type EstimatePoint = {
  attemptId: string
  kind: string
  completedAt: string
  rw: Range | null
  math: Range | null
  /** Only when both sections were estimated in the same attempt. */
  total: Range | null
}

function range(low: number | null, high: number | null): Range | null {
  if (low === null || high === null) return null
  const lo = Math.min(low, high)
  const hi = Math.max(low, high)
  return { low: lo, high: hi, mid: Math.round((lo + hi) / 2) }
}

/** Chronological estimate points from completed attempts that carry at least one section estimate. */
export function estimatePoints(rows: EstimateRow[]): EstimatePoint[] {
  return rows
    .filter((r) => r.completed_at)
    .map((r) => {
      const rw = range(r.rw_estimate_low, r.rw_estimate_high)
      const math = range(r.math_estimate_low, r.math_estimate_high)
      const total = rw && math ? { low: rw.low + math.low, high: rw.high + math.high, mid: rw.mid + math.mid } : null
      return { attemptId: r.id, kind: r.kind, completedAt: r.completed_at as string, rw, math, total }
    })
    .filter((p) => p.rw || p.math)
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
}

export type LatestEstimate = { rw: (Range & { at: string }) | null; math: (Range & { at: string }) | null; total: (Range & { at: string }) | null }

/** Most recent estimate per section (and total), from chronological points. */
export function latestEstimate(points: EstimatePoint[]): LatestEstimate {
  const out: LatestEstimate = { rw: null, math: null, total: null }
  for (const p of points) {
    if (p.rw) out.rw = { ...p.rw, at: p.completedAt }
    if (p.math) out.math = { ...p.math, at: p.completedAt }
    if (p.total) out.total = { ...p.total, at: p.completedAt }
  }
  return out
}

/** Position of a score on a scale as a 0–100 percentage (clamped). */
export function scalePercent(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export type PlanTaskRow = {
  task_type: string
  subject_code?: string | null
  domain_id: string | null
  skill_id: string | null
  lesson_id: string | null
  mock_exam_id: string | null
}

/** Where a study-plan task takes the student (cross-feature URL contracts). */
export function taskHref(task: PlanTaskRow): string {
  switch (task.task_type) {
    case 'lesson':
      return task.lesson_id ? `/dashboard/lesson/${task.lesson_id}` : '/dashboard/courses'
    case 'practice':
    case 'review':
      if (task.subject_code && task.domain_id && task.skill_id) {
        return practiceHref({ subjectCode: task.subject_code, domainId: task.domain_id, skillId: task.skill_id })
      }
      if (task.subject_code) {
        const q = new URLSearchParams({ subject: task.subject_code })
        if (task.domain_id) q.set('domain', task.domain_id)
        return `/dashboard/practice?${q.toString()}`
      }
      return '/dashboard/practice'
    case 'mock_exam':
      return task.mock_exam_id ? `/dashboard/mock-exams/${task.mock_exam_id}` : '/dashboard/mock-exams'
    case 'diagnostic':
      return '/dashboard/diagnostic'
    default:
      return '/dashboard/study-plan'
  }
}

export function resultHref(kind: string, attemptId: string): string {
  return kind === 'mock_exam' ? `/dashboard/mock-exams/results/${attemptId}` : `/dashboard/results/${attemptId}`
}
