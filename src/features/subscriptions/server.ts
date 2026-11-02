import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getEntitlements, getUsage, type Entitlements } from '@/features/entitlements/server'
import { effectiveStatus, type EffectiveStatus } from '@/lib/payments/purpose'
import type { CurrentProfile } from '@/lib/auth/session'

export type PlanRef = { id: string; code: string; name: string; priceMinor: number; currency: string }

export type CurrentSubscription = {
  id: string
  plan: PlanRef
  status: string
  effective: EffectiveStatus
  periodStart: string
  periodEnd: string
  /** period end + grace days */
  graceEndsAt: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  scheduledPlan: PlanRef | null
  lastProvider: string | null
}

export async function getGraceDays(): Promise<number> {
  const { data, error } = await createAdminSupabase().rpc('billing_grace_days')
  if (error) throw error
  return typeof data === 'number' ? data : 3
}

type PlanEmbed = { id: string; code: string; name: string; price_minor: number; currency: string } | null

const toPlanRef = (p: PlanEmbed): PlanRef | null =>
  p ? { id: p.id, code: p.code, name: p.name, priceMinor: Number(p.price_minor), currency: p.currency } : null

/** The user's `status = 'active'` subscription row (at most one), with its effective status. */
export async function loadCurrentSubscription(userId: string, now = new Date()): Promise<CurrentSubscription | null> {
  const admin = createAdminSupabase()
  const [{ data, error }, graceDays] = await Promise.all([
    admin
      .from('subscriptions')
      .select(
        'id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, last_provider, ' +
          'plan:plans!subscriptions_plan_id_fkey(id, code, name, price_minor, currency), ' +
          'scheduled:plans!subscriptions_scheduled_plan_id_fkey(id, code, name, price_minor, currency)',
      )
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    getGraceDays(),
  ])
  if (error) throw error
  if (!data) return null
  const row = data as unknown as {
    id: string
    status: string
    current_period_start: string
    current_period_end: string
    cancel_at_period_end: boolean
    canceled_at: string | null
    last_provider: string | null
    plan: PlanEmbed
    scheduled: PlanEmbed
  }
  const plan = toPlanRef(row.plan)
  if (!plan) return null
  return {
    id: row.id,
    plan,
    status: row.status,
    effective: effectiveStatus(row.status, row.current_period_end, graceDays, now),
    periodStart: row.current_period_start,
    periodEnd: row.current_period_end,
    graceEndsAt: new Date(new Date(row.current_period_end).getTime() + graceDays * 86_400_000).toISOString(),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at,
    scheduledPlan: toPlanRef(row.scheduled),
    lastProvider: row.last_provider,
  }
}

export type SubscriptionOverview = {
  plan: { code: string; name: string }
  /** 'none' = free plan (no paid subscription in effect) */
  status: Entitlements['status']
  subscription: CurrentSubscription | null
  features: Entitlements['features']
  usage: {
    practiceToday: { used: number; limit: number | null; enabled: boolean }
    aiToday: { used: number; limit: number | null; enabled: boolean }
    mocksThisMonth: { used: number; limit: number | null; enabled: boolean }
  }
}

/** Everything GET /api/subscription and the subscription page show. */
export async function getSubscriptionOverview(profile: Pick<CurrentProfile, 'id' | 'timezone'>): Promise<SubscriptionOverview> {
  const [ent, current, practice, ai, mocks] = await Promise.all([
    getEntitlements(profile.id),
    loadCurrentSubscription(profile.id),
    getUsage(profile.id, 'practice_questions_daily', profile.timezone),
    getUsage(profile.id, 'ai_requests_daily', profile.timezone),
    getUsage(profile.id, 'mock_exams_monthly', profile.timezone),
  ])
  const inEffect = current && (current.effective === 'active' || current.effective === 'grace') ? current : null
  const f = ent.features
  return {
    plan: { code: ent.planCode, name: ent.planName },
    status: ent.status,
    subscription: inEffect,
    features: f,
    usage: {
      practiceToday: { used: practice, limit: f.practice_questions_daily.limit, enabled: f.practice_questions_daily.enabled },
      aiToday: { used: ai, limit: f.ai_requests_daily.limit, enabled: f.ai_requests_daily.enabled },
      mocksThisMonth: { used: mocks, limit: f.mock_exams_monthly.limit, enabled: f.mock_exams_monthly.enabled },
    },
  }
}
