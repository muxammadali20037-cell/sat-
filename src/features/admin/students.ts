import 'server-only'
import { z } from 'zod'
import type { Db } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ROLES, type Role, isRole } from '@/config/roles'
import { DbActionError } from './server-utils'
import { sanitizeSearch } from './params'
import { addDays } from '@/lib/time'
import { BUSINESS_TZ, toLocalDateKey } from './series'

export const STUDENTS_PAGE_SIZE = 25

export const StudentListQuerySchema = z.object({
  q: z.string().max(120).optional().default(''),
  role: z.union([z.enum(ROLES), z.literal('all'), z.literal('')]).optional().default('STUDENT'),
  onboarding: z.enum(['complete', 'incomplete', '']).optional().default(''),
  suspended: z.enum(['yes', 'no', '']).optional().default(''),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(STUDENTS_PAGE_SIZE),
})
export type StudentListQuery = z.output<typeof StudentListQuerySchema>

export type StudentListRow = {
  id: string
  fullName: string
  email: string
  role: Role
  onboardingCompleted: boolean
  isSuspended: boolean
  createdAt: string
  lastActiveAt: string | null
  plan: { name: string; status: 'active' | 'grace' } | null
}

async function graceDays(admin: Db): Promise<number> {
  const { data } = await admin.from('platform_settings').select('value').eq('key', 'billing.grace_period_days').maybeSingle()
  return typeof data?.value === 'number' ? data.value : 3
}

/**
 * Current paid plan per user (active or in grace), batched for a page of users. Uses the service
 * role AFTER the caller authorized the request (teachers may see plan names, not payments).
 */
export async function plansForUsers(userIds: string[]): Promise<Map<string, { name: string; status: 'active' | 'grace' }>> {
  const out = new Map<string, { name: string; status: 'active' | 'grace' }>()
  if (userIds.length === 0) return out
  const admin = createAdminSupabase()
  const [{ data, error }, grace] = await Promise.all([
    admin.from('subscriptions').select('user_id, current_period_end, plans!subscriptions_plan_id_fkey(name)').eq('status', 'active').in('user_id', userIds),
    graceDays(admin),
  ])
  if (error) throw new DbActionError(error)
  const now = Date.now()
  for (const s of data ?? []) {
    const end = new Date(s.current_period_end).getTime()
    if (end > now) out.set(s.user_id, { name: s.plans?.name ?? 'Paid plan', status: 'active' })
    else if (end + grace * 86_400_000 > now) out.set(s.user_id, { name: s.plans?.name ?? 'Paid plan', status: 'grace' })
  }
  return out
}

/** Paginated, searchable people list. User-scoped client: RLS lets only student viewers read profiles. */
export async function listStudents(db: Db, query: StudentListQuery): Promise<{ rows: StudentListRow[]; total: number }> {
  const from = (query.page - 1) * query.pageSize
  let q = db
    .from('profiles')
    .select('id, full_name, email, role, onboarding_completed_at, is_suspended, created_at, last_active_at', { count: 'exact' })
    .is('deleted_at', null)
  const term = sanitizeSearch(query.q)
  if (term) q = q.or(`full_name.ilike.*${term}*,email.ilike.*${term}*`)
  if (query.role && query.role !== 'all') q = q.eq('role', query.role)
  if (query.onboarding === 'complete') q = q.not('onboarding_completed_at', 'is', null)
  if (query.onboarding === 'incomplete') q = q.is('onboarding_completed_at', null)
  if (query.suspended === 'yes') q = q.eq('is_suspended', true)
  if (query.suspended === 'no') q = q.eq('is_suspended', false)
  const { data, error, count } = await q.order('created_at', { ascending: false }).order('id').range(from, from + query.pageSize - 1)
  if (error) throw new DbActionError(error)
  const plans = await plansForUsers((data ?? []).map((p) => p.id))
  return {
    total: count ?? 0,
    rows: (data ?? []).map((p) => ({
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      role: isRole(p.role) ? p.role : 'STUDENT',
      onboardingCompleted: p.onboarding_completed_at !== null,
      isSuspended: p.is_suspended,
      createdAt: p.created_at,
      lastActiveAt: p.last_active_at,
      plan: plans.get(p.id) ?? null,
    })),
  }
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export type StudentDetail = Awaited<ReturnType<typeof loadStudentDetail>>

export async function loadStudentDetail(db: Db, userId: string, opts: { includeBilling: boolean }) {
  const { data: profile, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw new DbActionError(error)
  if (!profile || profile.deleted_at) return null

  const today = toLocalDateKey(new Date(), profile.timezone || BUSINESS_TZ)
  const since = addDays(today, -29)
  const admin = createAdminSupabase()

  const [attempts, activity, progress, skillPerf, taxonomySkills, subs, payments, diagnostics] = await Promise.all([
    db
      .from('attempts')
      .select('id, kind, status, practice_mode, total_questions, answered_count, correct_count, started_at, completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high, time_spent_seconds, mock_exams!attempts_mock_exam_id_fkey(title), diagnostic_tests!attempts_diagnostic_test_id_fkey(title), skills!attempts_skill_id_fkey(name)')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(15),
    db
      .from('user_daily_activity')
      .select('activity_date, study_seconds, questions_answered, correct_answers, lessons_completed')
      .eq('user_id', userId)
      .gte('activity_date', since)
      .order('activity_date'),
    db
      .from('lesson_progress')
      .select('id, watched_seconds, completed_at, updated_at, lessons!lesson_progress_lesson_id_fkey(id, title, duration_seconds, courses!lessons_course_id_fkey(title))')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20),
    // skill_performance is not client-callable; service role after the page authorized the viewer.
    admin.rpc('skill_performance', { p_user_id: userId }),
    db.from('skills').select('id, name, domain_id, domains!skills_domain_id_fkey(name, subjects!domains_subject_id_fkey(code))'),
    opts.includeBilling
      ? db
          .from('subscriptions')
          .select('id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, last_provider, plans!subscriptions_plan_id_fkey(name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [], error: null }),
    opts.includeBilling
      ? db
          .from('payments')
          .select('id, number, status, provider, amount_minor, currency, purpose, paid_at, created_at, refund_amount_minor, plans!payments_plan_id_fkey(name)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('diagnostic_results')
      .select('id, accuracy, level, created_at, attempt_id, domains!diagnostic_results_domain_id_fkey(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(16),
  ])
  for (const r of [attempts, activity, progress, skillPerf, taxonomySkills, subs, payments, diagnostics]) {
    if (r.error) throw new DbActionError(r.error)
  }

  const skillMeta = new Map(
    (taxonomySkills.data ?? []).map((s) => [s.id, { name: s.name, domain: s.domains?.name ?? '', subject: s.domains?.subjects?.code ?? '' }]),
  )
  const skills = (skillPerf.data ?? [])
    .map((s) => ({
      skillId: s.skill_id,
      name: skillMeta.get(s.skill_id)?.name ?? 'Unknown skill',
      domain: skillMeta.get(s.skill_id)?.domain ?? '',
      answered: s.answered,
      correct: s.correct,
      accuracy: s.answered > 0 ? s.correct / s.answered : 0,
      lastAnsweredAt: s.last_answered_at,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.answered - a.answered)

  const activityByDate = new Map((activity.data ?? []).map((a) => [a.activity_date, a]))
  const activityDays = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(since, i)
    const a = activityByDate.get(date)
    return {
      date,
      studySeconds: a?.study_seconds ?? 0,
      questions: a?.questions_answered ?? 0,
      correct: a?.correct_answers ?? 0,
      lessons: a?.lessons_completed ?? 0,
    }
  })

  // Latest diagnostic attempt's per-domain results.
  const latestDiagAttempt = diagnostics.data?.[0]?.attempt_id ?? null
  const diagnostic = (diagnostics.data ?? [])
    .filter((d) => d.attempt_id === latestDiagAttempt)
    .map((d) => ({ domain: d.domains?.name ?? '', accuracy: Number(d.accuracy), level: d.level, createdAt: d.created_at }))

  return {
    profile,
    attempts: attempts.data ?? [],
    activityDays,
    progress: progress.data ?? [],
    skills,
    subscriptions: subs.data ?? [],
    payments: payments.data ?? [],
    diagnostic,
  }
}
