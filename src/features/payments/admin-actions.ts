'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getApiContext } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { writeAudit } from '@/lib/audit'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { computeCheckoutPurpose, majorToMinor } from '@/lib/payments/purpose'
import { loadCurrentSubscription } from '@/features/subscriptions/server'
import { applySuccessfulPayment, cancelPendingPayment, findPayment, markPaymentEvent, recordPaymentEvent, refundPayment } from './process'

function failure(err: unknown, fallback: string): ActionResult<never> {
  if (err instanceof ApiError) return { ok: false, error: err.message, code: err.code }
  console.error('[admin-billing]', err)
  return { ok: false, error: fallback }
}

const RefundInput = z.object({
  paymentId: z.uuid(),
  amount: z.string().trim().min(1),
  reason: z.string().trim().min(3, 'Give a reason (at least 3 characters).').max(500),
  revokeAccess: z.boolean(),
})

/**
 * Records a refund (money must be returned in the provider's cabinet — this does not move money).
 * billing_refund_payment runs with the admin as actor and writes the audit row itself.
 */
export async function refundPaymentAction(input: z.input<typeof RefundInput>): Promise<ActionResult> {
  try {
    const { profile } = await getApiContext(ADMIN_ROLES)
    await enforceRateLimit(RATE_LIMITS.admin, profile.id)
    const parsed = RefundInput.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Some fields are invalid.', fieldErrors: z.flattenError(parsed.error).fieldErrors }
    const payment = await findPayment({ id: parsed.data.paymentId })
    if (!payment) return { ok: false, error: 'Payment not found.' }
    if (payment.status !== 'succeeded') return { ok: false, error: `Only paid payments can be refunded (this one is ${payment.status}).` }
    const amountMinor = majorToMinor(parsed.data.amount)
    if (amountMinor === null || amountMinor <= 0 || amountMinor > payment.amountMinor) {
      return { ok: false, error: 'Refund amount must be more than 0 and at most the amount paid.', fieldErrors: { amount: ['Invalid amount'] } }
    }
    const event = await recordPaymentEvent({
      provider: 'manual',
      eventType: 'admin.refund_recorded',
      providerEventId: `refund:${payment.id}`,
      signatureValid: true,
      payload: { admin_id: profile.id, amount_minor: amountMinor, reason: parsed.data.reason, revoke_access: parsed.data.revokeAccess },
      paymentId: payment.id,
    })
    try {
      await refundPayment({
        paymentId: payment.id,
        amountMinor,
        reason: parsed.data.reason,
        revokeAccess: parsed.data.revokeAccess,
        actorId: profile.id,
      })
      await markPaymentEvent(event.id, null)
    } catch (err) {
      await markPaymentEvent(event.id, String((err as Error)?.message ?? err)).catch(() => undefined)
      throw err
    }
    revalidatePath(`/admin/payments/${payment.id}`)
    revalidatePath('/admin/payments')
    return { ok: true, message: 'Refund recorded' }
  } catch (err) {
    return failure(err, 'The refund could not be recorded.')
  }
}

const OfflineInput = z.object({
  email: z.email().max(254),
  planCode: z.string().regex(/^[a-z0-9_]{2,40}$/),
  amount: z.string().trim().min(1),
  currency: z.enum(['UZS', 'USD']),
  months: z.coerce.number().int().min(1).max(12),
  reference: z.string().trim().max(100).optional().default(''),
  note: z.string().trim().min(3, 'Add a note (at least 3 characters).').max(500),
})

/**
 * Bank transfer / cash: creates a `manual` payment and applies it with the same SQL function as
 * provider callbacks (subscription created/extended/upgraded, audited). A bank reference can be
 * recorded only once (unique provider transaction id).
 */
export async function recordOfflinePaymentAction(input: z.input<typeof OfflineInput>): Promise<ActionResult<{ paymentId: string }>> {
  try {
    const { profile } = await getApiContext(ADMIN_ROLES)
    await enforceRateLimit(RATE_LIMITS.admin, profile.id)
    const parsed = OfflineInput.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Some fields are invalid.', fieldErrors: z.flattenError(parsed.error).fieldErrors }
    const d = parsed.data
    const admin = createAdminSupabase()

    const { data: user } = await admin.from('profiles').select('id, email').ilike('email', d.email.replace(/[%_\\]/g, (m) => `\\${m}`)).maybeSingle()
    if (!user) return { ok: false, error: 'No account with that email.', fieldErrors: { email: ['No account with that email'] } }
    const { data: plan } = await admin.from('plans').select('id, code, name, price_minor, is_active').eq('code', d.planCode).maybeSingle()
    if (!plan || !plan.is_active || Number(plan.price_minor) <= 0) return { ok: false, error: 'Choose an active paid plan.' }
    const amountMinor = majorToMinor(d.amount)
    if (amountMinor === null || amountMinor <= 0) return { ok: false, error: 'Enter the amount received.', fieldErrors: { amount: ['Invalid amount'] } }

    const tx = d.reference ? `manual:${d.reference}` : null
    if (tx) {
      const { data: dup } = await admin.from('payments').select('id, number').eq('provider', 'manual').eq('provider_transaction_id', tx).maybeSingle()
      if (dup) return { ok: false, error: `This reference was already recorded as payment #${dup.number}.`, fieldErrors: { reference: ['Already recorded'] } }
    }

    const current = await loadCurrentSubscription(user.id)
    const purpose = computeCheckoutPurpose(
      current ? { planId: current.plan.id, planPriceMinor: current.plan.priceMinor, effective: current.effective, scheduledPlanId: current.scheduledPlan?.id ?? null } : null,
      { planId: plan.id, priceMinor: Number(plan.price_minor) },
    )
    const purposeValue = purpose.ok ? purpose.purpose : purpose.reason === 'scheduled_change_pending' ? 'renewal' : 'downgrade'

    const { data: payment, error } = await admin
      .from('payments')
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        provider: 'manual',
        status: 'pending',
        purpose: purposeValue,
        amount_minor: amountMinor,
        currency: d.currency,
        period_months: d.months,
        idempotency_key: `manual-${randomUUID()}`,
      })
      .select('id, number')
      .single()
    if (error) throw error

    const event = await recordPaymentEvent({
      provider: 'manual',
      eventType: 'admin.offline_payment',
      providerEventId: `manual:${payment.id}`,
      signatureValid: true,
      payload: { admin_id: profile.id, reference: d.reference || null, note: d.note, amount_minor: amountMinor, currency: d.currency, months: d.months },
      paymentId: payment.id,
    })
    try {
      await applySuccessfulPayment(payment.id, tx)
      await markPaymentEvent(event.id, null)
    } catch (err) {
      await markPaymentEvent(event.id, String((err as Error)?.message ?? err)).catch(() => undefined)
      await cancelPendingPayment(payment.id, 'Offline payment could not be applied').catch(() => undefined)
      throw err
    }

    await writeAudit({
      actorId: profile.id,
      actorRole: profile.role,
      action: 'billing.offline_payment_recorded',
      entityType: 'payment',
      entityId: payment.id,
      summary: `Offline payment #${payment.number} for ${user.email}: ${plan.code}, ${d.months} month(s)`,
      after: { amount_minor: amountMinor, currency: d.currency, reference: d.reference || null, note: d.note, purpose: purposeValue },
    })
    revalidatePath('/admin/payments')
    revalidatePath('/admin/subscriptions')
    return { ok: true, data: { paymentId: payment.id }, message: 'Payment recorded' }
  } catch (err) {
    return failure(err, 'The payment could not be recorded.')
  }
}
