import 'server-only'
import type { Db } from '@/lib/supabase/server'
import type { Json } from '@/types/database'
import { QUESTION_STATUSES, CONTENT_STATUSES, type QuestionStatus, type ContentStatus } from '@/features/content/constants'
import { DbActionError, countRows, fetchAll, profileNames } from './server-utils'
import {
  BUSINESS_TZ,
  aggregate,
  countBy,
  distinctPerBucket,
  lastBuckets,
  localMidnightIso,
  bucketStartDate,
  revenueByCurrency,
  revenueWindow,
  type CurrencySeries,
  type RevenuePeriod,
  type SeriesPoint,
} from './series'

// ---------------------------------------------------------------------------
// admin_dashboard_metrics()
// ---------------------------------------------------------------------------

export const DASHBOARD_METRIC_KEYS = [
  'total_students',
  'new_students_7d',
  'new_students_30d',
  'active_subscriptions',
  'mrr_minor_uzs',
  'payments_count_30d',
  'payments_minor_uzs_30d',
  'payments_minor_uzs_all',
  'failed_payments_30d',
  'cancellations_30d',
  'active_students_7d',
  'questions_answered_7d',
  'lessons_completed_7d',
  'mock_exams_completed_30d',
  'ai_requests_7d',
  'ai_cost_micros_30d',
  'published_questions',
  'questions_awaiting_review',
  'published_lessons',
] as const
export type DashboardMetrics = Record<(typeof DASHBOARD_METRIC_KEYS)[number], number>

export function parseDashboardMetrics(raw: Json | null): DashboardMetrics {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const out = {} as DashboardMetrics
  for (const key of DASHBOARD_METRIC_KEYS) {
    const v = (obj as Record<string, Json | undefined>)[key]
    out[key] = typeof v === 'number' ? v : Number(v ?? 0) || 0
  }
  return out
}

/** Calls the SQL function with the USER-SCOPED client (it re-checks is_admin()). */
export async function getDashboardMetrics(db: Db): Promise<DashboardMetrics> {
  const { data, error } = await db.rpc('admin_dashboard_metrics')
  if (error) throw new DbActionError(error)
  return parseDashboardMetrics(data)
}

// ---------------------------------------------------------------------------
// Shared content counts
// ---------------------------------------------------------------------------

export async function questionStatusCounts(db: Db): Promise<Record<QuestionStatus, number>> {
  const counts = await Promise.all(
    QUESTION_STATUSES.map((s) => countRows(db.from('questions').select('id', { count: 'exact', head: true }).eq('status', s))),
  )
  return Object.fromEntries(QUESTION_STATUSES.map((s, i) => [s, counts[i]!])) as Record<QuestionStatus, number>
}

export async function lessonStatusCounts(db: Db): Promise<Record<ContentStatus, number>> {
  const counts = await Promise.all(
    CONTENT_STATUSES.map((s) => countRows(db.from('lessons').select('id', { count: 'exact', head: true }).eq('status', s))),
  )
  return Object.fromEntries(CONTENT_STATUSES.map((s, i) => [s, counts[i]!])) as Record<ContentStatus, number>
}

export async function courseStatusCounts(db: Db): Promise<Record<ContentStatus, number>> {
  const counts = await Promise.all(
    CONTENT_STATUSES.map((s) => countRows(db.from('courses').select('id', { count: 'exact', head: true }).eq('status', s))),
  )
  return Object.fromEntries(CONTENT_STATUSES.map((s, i) => [s, counts[i]!])) as Record<ContentStatus, number>
}

// ---------------------------------------------------------------------------
// Admin overview
// ---------------------------------------------------------------------------

export type RecentPayment = {
  id: string
  number: number
  amountMinor: number
  currency: string
  status: string
  provider: string
  createdAt: string
  studentName: string
  studentEmail: string
  studentId: string
  planName: string
}

export type TopCourse = { id: string; title: string; status: string; learners: number; completions: number }
export type ActivityItem = {
  id: string
  action: string
  entityType: string
  entityId: string | null
  summary: string
  createdAt: string
  actorName: string | null
}

export async function revenueSeriesFor(db: Db, period: RevenuePeriod): Promise<{ series: CurrencySeries[]; truncated: boolean; granularity: 'day' | 'week' | 'month' }> {
  const win = revenueWindow(period)
  const { rows, truncated } = await fetchAll((from, to) =>
    db
      .from('payments')
      .select('id, paid_at, amount_minor, currency')
      .eq('status', 'succeeded')
      .gte('paid_at', win.startIso)
      .order('paid_at', { ascending: true })
      .order('id')
      .range(from, to),
  )
  const series = revenueByCurrency(
    rows.map((r) => ({ at: r.paid_at, amountMinor: Number(r.amount_minor), currency: r.currency })),
    win.keys,
    win.granularity,
  )
  return { series, truncated, granularity: win.granularity }
}

export async function planSalesFor(db: Db, period: RevenuePeriod): Promise<Array<{ plan: string; count: number }>> {
  const win = revenueWindow(period)
  const [{ rows }, plans] = await Promise.all([
    fetchAll((from, to) =>
      db.from('payments').select('id, plan_id').eq('status', 'succeeded').gte('paid_at', win.startIso).order('id').range(from, to),
    ),
    db.from('plans').select('id, name, position').order('position'),
  ])
  if (plans.error) throw new DbActionError(plans.error)
  const names = new Map((plans.data ?? []).map((p) => [p.id, p.name]))
  const paidPlans = (plans.data ?? []).filter((p) => rows.some((r) => r.plan_id === p.id))
  return countBy(rows, (r) => names.get(r.plan_id) ?? 'Unknown plan', paidPlans.map((p) => p.name)).map((x) => ({ plan: x.key, count: x.count }))
}

export async function recentPayments(db: Db, limit = 6): Promise<RecentPayment[]> {
  const { data, error } = await db
    .from('payments')
    .select(
      'id, number, amount_minor, currency, status, provider, created_at, user_id, profiles!payments_user_id_fkey(full_name, email), plans!payments_plan_id_fkey(name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new DbActionError(error)
  return (data ?? []).map((p) => ({
    id: p.id,
    number: Number(p.number),
    amountMinor: Number(p.amount_minor),
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    createdAt: p.created_at,
    studentId: p.user_id,
    studentName: p.profiles?.full_name || p.profiles?.email || 'Unknown student',
    studentEmail: p.profiles?.email ?? '',
    planName: p.plans?.name ?? '—',
  }))
}

/** Learners = distinct students with any lesson progress in the course; completions = completed lessons. */
export async function topCourses(db: Db, limit = 5): Promise<{ courses: TopCourse[]; truncated: boolean }> {
  const [courses, progress] = await Promise.all([
    db.from('courses').select('id, title, status'),
    fetchAll((from, to) =>
      db.from('lesson_progress').select('id, user_id, completed_at, lessons!inner(course_id)').order('id').range(from, to),
    ),
  ])
  if (courses.error) throw new DbActionError(courses.error)
  const learners = new Map<string, Set<string>>()
  const completions = new Map<string, number>()
  for (const row of progress.rows) {
    const courseId = row.lessons?.course_id
    if (!courseId) continue
    if (!learners.has(courseId)) learners.set(courseId, new Set())
    learners.get(courseId)!.add(row.user_id)
    if (row.completed_at) completions.set(courseId, (completions.get(courseId) ?? 0) + 1)
  }
  const list = (courses.data ?? [])
    .map((c) => ({ id: c.id, title: c.title, status: c.status, learners: learners.get(c.id)?.size ?? 0, completions: completions.get(c.id) ?? 0 }))
    .filter((c) => c.learners > 0)
    .sort((a, b) => b.learners - a.learners || b.completions - a.completions)
    .slice(0, limit)
  return { courses: list, truncated: progress.truncated }
}

export async function recentAuditActivity(db: Db, limit = 8): Promise<ActivityItem[]> {
  const { data, error } = await db
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, summary, created_at, actor_id')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new DbActionError(error)
  const names = await profileNames(db, (data ?? []).map((r) => r.actor_id))
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    summary: r.summary,
    createdAt: r.created_at,
    actorName: r.actor_id ? (names.get(r.actor_id)?.name ?? 'Unknown user') : null,
  }))
}

export async function subscriptionsExpiringSoon(db: Db, days = 7): Promise<number> {
  const now = new Date()
  const until = new Date(now.getTime() + days * 86_400_000)
  return countRows(
    db
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('current_period_end', now.toISOString())
      .lt('current_period_end', until.toISOString()),
  )
}

// ---------------------------------------------------------------------------
// Content overview (editors and teachers)
// ---------------------------------------------------------------------------

export type ContentItem = { id: string; title: string; status: string; updatedAt: string; meta: string }

export async function reviewQueue(db: Db, limit = 6): Promise<ContentItem[]> {
  const { data, error } = await db
    .from('questions')
    .select('id, stem, status, difficulty, question_type, created_at, updated_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw new DbActionError(error)
  return (data ?? []).map((q) => ({
    id: q.id,
    title: q.stem,
    status: q.status,
    updatedAt: q.created_at,
    meta: `${q.difficulty} · ${q.question_type === 'multiple_choice' ? 'MC' : 'SPR'}`,
  }))
}

export async function recentlyEdited(db: Db, limit = 6): Promise<{ questions: ContentItem[]; lessons: ContentItem[] }> {
  const [q, l] = await Promise.all([
    db.from('questions').select('id, stem, status, difficulty, updated_at').order('updated_at', { ascending: false }).limit(limit),
    db.from('lessons').select('id, title, status, updated_at, courses!lessons_course_id_fkey(title)').order('updated_at', { ascending: false }).limit(limit),
  ])
  if (q.error) throw new DbActionError(q.error)
  if (l.error) throw new DbActionError(l.error)
  return {
    questions: (q.data ?? []).map((x) => ({ id: x.id, title: x.stem, status: x.status, updatedAt: x.updated_at, meta: x.difficulty })),
    lessons: (l.data ?? []).map((x) => ({ id: x.id, title: x.title, status: x.status, updatedAt: x.updated_at, meta: x.courses?.title ?? '' })),
  }
}

// ---------------------------------------------------------------------------
// Analytics (ADMIN_ROLES)
// ---------------------------------------------------------------------------

export type HardQuestion = { id: string; stem: string; skillName: string; answered: number; correct: number; accuracy: number }

export type AnalyticsData = {
  registrationsPerWeek: SeriesPoint[]
  activeStudentsPerWeek: SeriesPoint[]
  questionsPerDay: SeriesPoint[]
  lessonCompletionsPerWeek: SeriesPoint[]
  revenuePerMonth: CurrencySeries[]
  planDistribution: Array<{ plan: string; count: number }>
  conversion: { students: number; payingStudents: number; rate: number | null }
  hardestQuestions: HardQuestion[]
  hardestSample: { answers: number; truncated: boolean; days: number }
  diagnosticLevels: Array<{ level: string; count: number }>
  truncated: string[]
}

const HARDEST_DAYS = 180
const HARDEST_MAX_ANSWERS = 30_000

export async function loadAnalytics(db: Db): Promise<AnalyticsData> {
  const truncated: string[] = []
  const weeks = lastBuckets('week', 12)
  const days = lastBuckets('day', 30)
  const months = lastBuckets('month', 12)
  const weeksStart = localMidnightIso(weeks[0]!)
  const monthsStart = localMidnightIso(bucketStartDate(months[0]!))

  const [registrations, activity, payments, subs, plans, graceSetting, students, payers, diag, answers] = await Promise.all([
    fetchAll((from, to) =>
      db.from('profiles').select('id, created_at').eq('role', 'STUDENT').gte('created_at', weeksStart).order('id').range(from, to),
    ),
    fetchAll((from, to) =>
      db
        .from('user_daily_activity')
        .select('id, user_id, activity_date, questions_answered, lessons_completed')
        .gte('activity_date', weeks[0]!)
        .order('id')
        .range(from, to),
    ),
    fetchAll((from, to) =>
      db.from('payments').select('id, paid_at, amount_minor, currency').eq('status', 'succeeded').gte('paid_at', monthsStart).order('id').range(from, to),
    ),
    fetchAll((from, to) => db.from('subscriptions').select('id, plan_id, current_period_end').eq('status', 'active').order('id').range(from, to)),
    db.from('plans').select('id, name, position').order('position'),
    db.from('platform_settings').select('value').eq('key', 'billing.grace_period_days').maybeSingle(),
    countRows(db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'STUDENT').is('deleted_at', null)),
    fetchAll((from, to) =>
      db
        .from('payments')
        .select('id, user_id, profiles!payments_user_id_fkey!inner(role)')
        .eq('status', 'succeeded')
        .eq('profiles.role', 'STUDENT')
        .order('id')
        .range(from, to),
    ),
    fetchAll((from, to) =>
      db
        .from('diagnostic_results')
        .select('id, level')
        .gte('created_at', new Date(Date.now() - 365 * 86_400_000).toISOString())
        .order('id')
        .range(from, to),
    ),
    fetchAll(
      (from, to) =>
        db
          .from('attempt_answers')
          .select('id, question_id, is_correct')
          .not('is_correct', 'is', null)
          .gte('answered_at', new Date(Date.now() - HARDEST_DAYS * 86_400_000).toISOString())
          .order('answered_at', { ascending: false })
          .order('id')
          .range(from, to),
      { max: HARDEST_MAX_ANSWERS },
    ),
  ])
  if (plans.error) throw new DbActionError(plans.error)
  if (graceSetting.error) throw new DbActionError(graceSetting.error)
  for (const [name, r] of [
    ['registrations', registrations],
    ['activity', activity],
    ['payments', payments],
    ['subscriptions', subs],
    ['payers', payers],
    ['diagnostics', diag],
  ] as const) {
    if (r.truncated) truncated.push(name)
  }

  const graceDays = typeof graceSetting.data?.value === 'number' ? graceSetting.data.value : 3
  const effectiveCutoff = Date.now() - graceDays * 86_400_000
  const planNames = new Map((plans.data ?? []).map((p) => [p.id, p.name]))
  const activeSubs = subs.rows.filter((s) => new Date(s.current_period_end).getTime() > effectiveCutoff)
  const planDistribution = countBy(activeSubs, (s) => planNames.get(s.plan_id) ?? 'Unknown plan', (plans.data ?? []).map((p) => p.name))
    .filter((x) => x.count > 0)
    .map((x) => ({ plan: x.key, count: x.count }))

  const payingStudents = new Set(payers.rows.map((p) => p.user_id)).size

  // Hardest published questions: lowest accuracy with at least 5 scored answers in the sample.
  const stats = new Map<string, { answered: number; correct: number }>()
  for (const a of answers.rows) {
    const s = stats.get(a.question_id) ?? { answered: 0, correct: 0 }
    s.answered++
    if (a.is_correct) s.correct++
    stats.set(a.question_id, s)
  }
  const candidates = [...stats.entries()].filter(([, s]) => s.answered >= 5)
  let hardestQuestions: HardQuestion[] = []
  if (candidates.length > 0) {
    const ranked = candidates.sort((a, b) => a[1].correct / a[1].answered - b[1].correct / b[1].answered || b[1].answered - a[1].answered)
    const ids = ranked.slice(0, 60).map(([id]) => id)
    const [qs, skills] = await Promise.all([
      db.from('questions').select('id, stem, skill_id, status').in('id', ids).eq('status', 'published'),
      db.from('skills').select('id, name'),
    ])
    if (qs.error) throw new DbActionError(qs.error)
    if (skills.error) throw new DbActionError(skills.error)
    const qMap = new Map((qs.data ?? []).map((q) => [q.id, q]))
    const skillNames = new Map((skills.data ?? []).map((s) => [s.id, s.name]))
    hardestQuestions = ranked
      .filter(([id]) => qMap.has(id))
      .slice(0, 10)
      .map(([id, s]) => {
        const q = qMap.get(id)!
        return { id, stem: q.stem, skillName: skillNames.get(q.skill_id) ?? '', answered: s.answered, correct: s.correct, accuracy: s.correct / s.answered }
      })
  }

  return {
    registrationsPerWeek: aggregate(registrations.rows, weeks, 'week', (r) => r.created_at),
    activeStudentsPerWeek: distinctPerBucket(
      activity.rows.filter((r) => r.questions_answered > 0 || r.lessons_completed > 0),
      weeks,
      'week',
      (r) => r.activity_date,
      (r) => r.user_id,
    ),
    questionsPerDay: aggregate(activity.rows, days, 'day', (r) => r.activity_date, (r) => r.questions_answered),
    lessonCompletionsPerWeek: aggregate(activity.rows, weeks, 'week', (r) => r.activity_date, (r) => r.lessons_completed),
    revenuePerMonth: revenueByCurrency(
      payments.rows.map((p) => ({ at: p.paid_at, amountMinor: Number(p.amount_minor), currency: p.currency })),
      months,
      'month',
      BUSINESS_TZ,
    ),
    planDistribution,
    conversion: { students, payingStudents, rate: students > 0 ? payingStudents / students : null },
    hardestQuestions,
    hardestSample: { answers: answers.rows.length, truncated: answers.truncated, days: HARDEST_DAYS },
    diagnosticLevels: countBy(diag.rows, (r) => r.level, ['foundation', 'developing', 'proficient', 'advanced']).map((x) => ({
      level: x.key,
      count: x.count,
    })),
    truncated,
  }
}
