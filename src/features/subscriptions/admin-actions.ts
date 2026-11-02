'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getApiContext } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { FEATURE_KEYS } from '@/features/entitlements/server'
import { majorToMinor } from '@/lib/payments/purpose'
import { loadCurrentSubscription } from './server'

function failure(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ApiError) return { ok: false, error: err.message, code: err.code }
  console.error('[admin-subscriptions]', err)
  return { ok: false, error: fallback }
}

const GrantInput = z.object({
  email: z.email().max(254),
  planCode: z.string().regex(/^[a-z0-9_]{2,40}$/),
  days: z.coerce.number().int().min(1).max(366),
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters).').max(500),
})

/**
 * Trusted admin process: creates or extends a subscription without a payment (no revenue is
 * recorded). Extension starts from the later of now and the current period end; choosing another
 * plan switches the plan without pro-rata conversion. last_provider = 'manual'. Audited.
 */
export async function grantAccessAction(input: z.input<typeof GrantInput>): Promise<ActionResult<{ subscriptionId: string }>> {
  try {
    const { profile } = await getApiContext(ADMIN_ROLES)
    await enforceRateLimit(RATE_LIMITS.admin, profile.id)
    const parsed = GrantInput.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Some fields are invalid.', fieldErrors: z.flattenError(parsed.error).fieldErrors }
    const d = parsed.data
    const admin = createAdminSupabase()

    const { data: user } = await admin.from('profiles').select('id, email').ilike('email', d.email.replace(/[%_\\]/g, (m) => `\\${m}`)).maybeSingle()
    if (!user) return { ok: false, error: 'No account with that email.', fieldErrors: { email: ['No account with that email'] } }
    const { data: plan } = await admin.from('plans').select('id, code, name, price_minor, is_active').eq('code', d.planCode).maybeSingle()
    if (!plan || !plan.is_active || Number(plan.price_minor) <= 0) return { ok: false, error: 'Choose an active paid plan.' }

    const now = new Date()
    const ms = d.days * 86_400_000
    const current = await loadCurrentSubscription(user.id, now)
    let subscriptionId: string
    let before: Record<string, string | boolean | null> | null = null

    if (current && current.effective === 'expired') {
      await admin.from('subscriptions').update({ status: 'expired' }).eq('id', current.id).eq('status', 'active')
    }
    if (current && current.effective !== 'expired') {
      before = { plan: current.plan.code, current_period_end: current.periodEnd, cancel_at_period_end: current.cancelAtPeriodEnd }
      const base = Math.max(new Date(current.periodEnd).getTime(), now.getTime())
      const changePlan = current.plan.id !== plan.id
      const { data, error } = await admin
        .from('subscriptions')
        .update({
          plan_id: plan.id,
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
      if (data.length === 0) return { ok: false, error: 'The subscription changed meanwhile. Reload and try again.' }
      subscriptionId = current.id
    } else {
      const { data, error } = await admin
        .from('subscriptions')
        .insert({
          user_id: user.id,
          plan_id: plan.id,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: new Date(now.getTime() + ms).toISOString(),
          last_provider: 'manual',
        })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') return { ok: false, error: 'The student got an active subscription meanwhile. Reload and try again.' }
        throw error
      }
      subscriptionId = data.id
    }

    await writeAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'billing.access_granted',
      entityType: 'subscription',
      entityId: subscriptionId,
      summary: `Granted ${d.days} day(s) of ${plan.code} to ${user.email} (no payment): ${d.reason}`,
      before,
      after: { plan: plan.code, days: d.days, reason: d.reason },
    })
    revalidatePath('/admin/subscriptions')
    revalidatePath(`/admin/subscriptions/${subscriptionId}`)
    return { ok: true, data: { subscriptionId }, message: 'Access granted' }
  } catch (err) {
    return failure(err, 'Access could not be granted.')
  }
}

const money = z.string().trim().regex(/^\d{1,13}(\.\d{1,2})?$/, 'Use a number like 99000 or 9.00')

const PlanInput = z.object({
  planId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500),
  price: money,
  usdPrice: z.union([money, z.literal('')]),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  highlight: z.boolean(),
  features: z.record(
    z.enum(FEATURE_KEYS),
    z.object({ enabled: z.boolean(), limit: z.union([z.literal(''), z.string().trim().regex(/^\d{1,7}$/, 'Whole number or blank')]) }),
  ),
})

/**
 * Plan editor. Uses the admin's own session (RLS: plans_admin_update etc.) so the row-change
 * audit trigger records the real actor; prices are pricing hypotheses and can change any time
 * (existing subscriptions keep their period; future payments use the new price).
 */
export async function updatePlanAction(input: z.input<typeof PlanInput>): Promise<ActionResult> {
  try {
    const { profile } = await getApiContext(ADMIN_ROLES)
    await enforceRateLimit(RATE_LIMITS.admin, profile.id)
    const parsed = PlanInput.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Some fields are invalid.', fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> }
    const d = parsed.data
    const db = await createServerSupabase()

    const { data: plan, error: planError } = await db.from('plans').select('id, code').eq('id', d.planId).maybeSingle()
    if (planError) throw planError
    if (!plan) return { ok: false, error: 'Plan not found.' }
    const isFree = plan.code === 'free'
    const priceMinor = majorToMinor(d.price) ?? 0
    if (isFree && (priceMinor !== 0 || !d.isActive)) return { ok: false, error: 'The free plan must stay active with price 0 (it is the fallback for everyone).' }
    if (!isFree && priceMinor <= 0) return { ok: false, error: 'Paid plans need a price above 0.', fieldErrors: { price: ['Must be above 0'] } }

    const { error: updateError } = await db
      .from('plans')
      .update({ name: d.name, description: d.description, price_minor: priceMinor, is_active: d.isActive, is_public: d.isPublic, highlight: d.highlight })
      .eq('id', plan.id)
    if (updateError) throw updateError

    if (!isFree) {
      const usdMinor = d.usdPrice === '' ? null : majorToMinor(d.usdPrice)
      if (usdMinor !== null && usdMinor > 0) {
        const { error } = await db
          .from('plan_prices')
          .upsert({ plan_id: plan.id, currency: 'USD', amount_minor: usdMinor, is_active: true }, { onConflict: 'plan_id,currency' })
        if (error) throw error
      } else {
        const { error } = await db.from('plan_prices').update({ is_active: false }).eq('plan_id', plan.id).eq('currency', 'USD')
        if (error) throw error
      }
    }

    const rows = FEATURE_KEYS.filter((k) => d.features[k]).map((k) => ({
      plan_id: plan.id,
      feature_key: k,
      is_enabled: d.features[k]!.enabled,
      limit_value: d.features[k]!.limit === '' ? null : Number(d.features[k]!.limit),
    }))
    if (rows.length > 0) {
      const { error } = await db.from('plan_features').upsert(rows, { onConflict: 'plan_id,feature_key' })
      if (error) throw error
    }

    await writeAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'billing.plan_updated',
      entityType: 'plan',
      entityId: plan.id,
      summary: `Updated plan ${plan.code}`,
      after: { name: d.name, price_minor: priceMinor, usd: d.usdPrice || null, is_active: d.isActive, is_public: d.isPublic, highlight: d.highlight },
    })
    revalidatePath('/admin/subscriptions/plans')
    revalidatePath('/dashboard/subscription')
    return { ok: true, message: 'Plan saved' }
  } catch (err) {
    return failure(err, 'The plan could not be saved.')
  }
}
