import 'server-only'
import { cache } from 'react'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { startOfLocalDay, startOfLocalMonth } from '@/lib/time'

export const FEATURE_KEYS = [
  'diagnostic',
  'video_lessons',
  'practice_questions_daily',
  'ai_requests_daily',
  'mock_exams_monthly',
  'analytics_full',
  'study_plan',
] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]

export type Entitlements = {
  planCode: string
  planName: string
  /** 'none' = on the free plan (no paid subscription in effect) */
  status: 'active' | 'grace' | 'none'
  periodEnd: string | null
  features: Record<FeatureKey, { enabled: boolean; limit: number | null }>
}

const EMPTY_FEATURES = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: false, limit: 0 }])) as Entitlements['features']

/** Effective plan and features (active/grace subscription, else the free plan). Cached per request. */
export const getEntitlements = cache(async (userId: string): Promise<Entitlements> => {
  const admin = createAdminSupabase()
  const { data, error } = await admin.rpc('get_entitlements', { p_user_id: userId })
  if (error) throw error
  const rows = data ?? []
  const first = rows[0]
  const features = { ...EMPTY_FEATURES }
  for (const row of rows) {
    if ((FEATURE_KEYS as readonly string[]).includes(row.feature_key)) {
      features[row.feature_key as FeatureKey] = { enabled: row.is_enabled, limit: row.limit_value ?? null }
    }
  }
  return {
    planCode: first?.plan_code ?? 'free',
    planName: first?.plan_name ?? 'Free',
    status: (first?.subscription_status as Entitlements['status']) ?? 'none',
    periodEnd: first?.period_end ?? null,
    features,
  }
})

/** Throws 402 PLAN_REQUIRED when the feature is not part of the user's plan. */
export async function requireFeature(userId: string, key: FeatureKey): Promise<Entitlements> {
  const ent = await getEntitlements(userId)
  if (!ent.features[key].enabled) {
    throw new ApiError(402, 'PLAN_REQUIRED', 'This feature is part of a paid plan.', { feature: key, plan: ent.planCode })
  }
  return ent
}

/** Usage counted against limited features, in the student's time zone. */
export async function getUsage(userId: string, key: 'practice_questions_daily' | 'ai_requests_daily' | 'mock_exams_monthly', timeZone: string): Promise<number> {
  const admin = createAdminSupabase()
  if (key === 'practice_questions_daily') {
    const { count, error } = await admin
      .from('attempt_answers')
      .select('id, attempts!inner(kind)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('attempts.kind', 'practice')
      .gte('answered_at', startOfLocalDay(timeZone).toISOString())
    if (error) throw error
    return count ?? 0
  }
  if (key === 'ai_requests_daily') {
    const { count, error } = await admin
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('endpoint', ['chat', 'explain', 'hint', 'generate_practice', 'study_plan'])
      .eq('status', 'ok')
      .gte('created_at', startOfLocalDay(timeZone).toISOString())
    if (error) throw error
    return count ?? 0
  }
  const { count, error } = await admin
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', 'mock_exam')
    .neq('status', 'abandoned')
    .gte('started_at', startOfLocalMonth(timeZone).toISOString())
  if (error) throw error
  return count ?? 0
}

/**
 * Enforce a counted limit. `increment` = how many units this action will consume.
 * Throws 402 PLAN_REQUIRED (feature off) or 402 PLAN_LIMIT_REACHED (quota used).
 */
export async function assertWithinLimit(
  userId: string,
  key: 'practice_questions_daily' | 'ai_requests_daily' | 'mock_exams_monthly',
  timeZone: string,
  increment = 1,
): Promise<{ used: number; limit: number | null }> {
  const ent = await requireFeature(userId, key)
  const limit = ent.features[key].limit
  if (limit === null) return { used: 0, limit: null }
  const used = await getUsage(userId, key, timeZone)
  if (used + increment > limit) {
    throw new ApiError(402, 'PLAN_LIMIT_REACHED', 'You have reached your plan limit for now.', { feature: key, used, limit, plan: ent.planCode })
  }
  return { used, limit }
}
