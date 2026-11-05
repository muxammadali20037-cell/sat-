import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { loadCurrentSubscription } from './server'

export type GrantPlan = { id: string; code: string }

export type GrantResult =
  | { ok: true; subscriptionId: string; before: Record<string, string | boolean | null> | null }
  | { ok: false; reason: 'conflict' }

/**
 * Creates or extends a subscription WITHOUT a payment (no revenue is recorded). Used only by trusted
 * server processes: an admin's "Grant access" and admin-configured referral rewards. Extension
 * starts from the later of now and the current period end; another plan switches the plan without
 * pro-rata conversion. last_provider = 'manual'. The caller writes the audit log.
 */
export async function extendPlanAccess(admin: Db, input: { userId: string; plan: GrantPlan; days: number; now?: Date; keepCurrentPlan?: boolean }): Promise<GrantResult> {
  const now = input.now ?? new Date()
  const ms = input.days * 86_400_000
  const current = await loadCurrentSubscription(input.userId, now)

  if (current && current.effective === 'expired') {
    await admin.from('subscriptions').update({ status: 'expired' }).eq('id', current.id).eq('status', 'active')
  }
  if (current && current.effective !== 'expired') {
    const before = { plan: current.plan.code, current_period_end: current.periodEnd, cancel_at_period_end: current.cancelAtPeriodEnd }
    const base = Math.max(new Date(current.periodEnd).getTime(), now.getTime())
    // keepCurrentPlan (referral rewards): a student on another paid plan keeps it and gets the days
    // on it, so a reward can never switch someone to a smaller plan.
    const changePlan = !input.keepCurrentPlan && current.plan.id !== input.plan.id
    const { data, error } = await admin
      .from('subscriptions')
      .update({
        plan_id: changePlan ? input.plan.id : current.plan.id,
        current_period_end: new Date(base + ms).toISOString(),
        ...(changePlan || new Date(current.periodEnd) < now ? { current_period_start: now.toISOString() } : {}),
        ...(changePlan ? { scheduled_plan_id: null } : {}),
        cancel_at_period_end: false,
        canceled_at: null,
        last_provider: 'manual',
      })
      .eq('id', current.id)
      .eq('status', 'active')
      .select('id')
    if (error) throw error
    if (data.length === 0) return { ok: false, reason: 'conflict' }
    return { ok: true, subscriptionId: current.id, before }
  }

  const { data, error } = await admin
    .from('subscriptions')
    .insert({
      user_id: input.userId,
      plan_id: input.plan.id,
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: new Date(now.getTime() + ms).toISOString(),
      last_provider: 'manual',
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'conflict' }
    throw error
  }
  return { ok: true, subscriptionId: data.id, before: null }
}
