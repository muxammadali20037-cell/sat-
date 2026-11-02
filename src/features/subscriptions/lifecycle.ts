import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { writeAudit } from '@/lib/audit'
import type { CurrentProfile } from '@/lib/auth/session'
import type { TablesUpdate } from '@/types/database'
import { loadCurrentSubscription, type CurrentSubscription } from './server'

/**
 * Student-initiated lifecycle changes. The student can only flip cancel_at_period_end and choose
 * a scheduled (cheaper) plan; status, plan and period dates change only through verified
 * payments or trusted admin actions. Each change is written by the service role after the DAL
 * check, filtered by the authorized user's own subscription id, and audited.
 */

type Actor = Pick<CurrentProfile, 'id' | 'role'>

async function requireCurrent(userId: string): Promise<CurrentSubscription> {
  const current = await loadCurrentSubscription(userId)
  if (!current || (current.effective !== 'active' && current.effective !== 'grace')) {
    throw new ApiError(409, 'CONFLICT', 'You do not have a paid plan right now.')
  }
  return current
}

async function update(actor: Actor, current: CurrentSubscription, patch: Pick<TablesUpdate<'subscriptions'>, 'cancel_at_period_end' | 'canceled_at' | 'scheduled_plan_id'>, action: string, summary: string) {
  const { data, error } = await createAdminSupabase()
    .from('subscriptions')
    .update(patch)
    .eq('id', current.id)
    .eq('user_id', actor.id)
    .eq('status', 'active')
    .select('id')
  if (error) throw error
  if (data.length === 0) throw new ApiError(409, 'CONFLICT', 'Your subscription changed meanwhile. Reload the page and try again.')
  await writeAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action,
    entityType: 'subscription',
    entityId: current.id,
    summary,
    before: { cancel_at_period_end: current.cancelAtPeriodEnd, scheduled_plan: current.scheduledPlan?.code ?? null },
    after: patch as never,
  })
}

/** Stop renewing: access continues until the end of the paid period (no reminders are sent). */
export async function cancelAtPeriodEnd(actor: Actor): Promise<void> {
  const current = await requireCurrent(actor.id)
  if (current.cancelAtPeriodEnd) return
  await update(actor, current, { cancel_at_period_end: true, canceled_at: new Date().toISOString() }, 'subscription.cancel', 'Student canceled renewal')
}

export async function resumeSubscription(actor: Actor): Promise<void> {
  const current = await requireCurrent(actor.id)
  if (!current.cancelAtPeriodEnd) return
  await update(actor, current, { cancel_at_period_end: false, canceled_at: null }, 'subscription.resume', 'Student resumed renewal')
}

/** A cheaper paid plan becomes what the next renewal buys. */
export async function scheduleDowngrade(actor: Actor, planCode: string): Promise<void> {
  const current = await requireCurrent(actor.id)
  const { data: plan, error } = await createAdminSupabase()
    .from('plans')
    .select('id, code, name, price_minor, is_active, is_public')
    .eq('code', planCode)
    .maybeSingle()
  if (error) throw error
  if (!plan || !plan.is_active || !plan.is_public) throw new ApiError(404, 'NOT_FOUND', 'That plan is not available.')
  if (plan.id === current.plan.id) throw new ApiError(409, 'CONFLICT', 'You are already on this plan.')
  if (Number(plan.price_minor) <= 0) {
    throw new ApiError(409, 'CONFLICT', 'To move to the free plan, cancel your plan instead. Access continues until the period ends.')
  }
  if (Number(plan.price_minor) >= current.plan.priceMinor) {
    throw new ApiError(409, 'CONFLICT', 'This plan is not cheaper than your current plan. Upgrade instead.')
  }
  if (current.scheduledPlan?.id === plan.id) return
  await update(actor, current, { scheduled_plan_id: plan.id }, 'subscription.schedule_downgrade', `Student scheduled a change to ${plan.code} at renewal`)
}

export async function cancelScheduledChange(actor: Actor): Promise<void> {
  const current = await requireCurrent(actor.id)
  if (!current.scheduledPlan) return
  await update(actor, current, { scheduled_plan_id: null }, 'subscription.cancel_scheduled_change', 'Student kept the current plan')
}
