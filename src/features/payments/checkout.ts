import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ApiError } from '@/lib/api/errors'
import { siteUrl } from '@/lib/env'
import { getPaymentProvider } from '@/lib/payments/registry'
import { computeCheckoutPurpose, pickPrice } from '@/lib/payments/purpose'
import type { ProviderId } from '@/lib/payments/types'
import type { CurrentProfile } from '@/lib/auth/session'
import { loadCurrentSubscription } from '@/features/subscriptions/server'
import { cancelPendingPayment } from './process'

export const returnPath = (paymentId: string) => `/dashboard/subscription/return?payment=${paymentId}`

/**
 * Creates (or returns, for a repeated idempotency key) a pending payment and the provider
 * redirect. Nothing here grants access: only verified provider callbacks do.
 */
export async function startCheckout(input: {
  profile: Pick<CurrentProfile, 'id' | 'email' | 'locale'>
  planCode: string
  providerId: ProviderId
  idempotencyKey: string
}): Promise<{ paymentId: string; redirectUrl: string }> {
  const admin = createAdminSupabase()
  const provider = getPaymentProvider(input.providerId)
  if (!provider.isConfigured()) {
    throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'This payment method is not available right now. Choose another one.')
  }

  const { data: plan, error: planError } = await admin
    .from('plans')
    .select('id, code, name, price_minor, currency, interval_months, is_active, is_public, plan_prices(currency, amount_minor, is_active)')
    .eq('code', input.planCode)
    .maybeSingle()
  if (planError) throw planError
  if (!plan || !plan.is_active || !plan.is_public) throw new ApiError(404, 'NOT_FOUND', 'That plan is not available.')
  if (Number(plan.price_minor) <= 0) throw new ApiError(400, 'VALIDATION_FAILED', 'The free plan does not need a payment.')

  // Idempotency: the same key from the same user returns the same payment.
  const existing = await findByIdempotencyKey(input.profile.id, input.idempotencyKey)
  if (existing) return resumeExisting(existing, plan.id, input.providerId)

  const price = pickPrice(
    {
      priceMinor: Number(plan.price_minor),
      currency: plan.currency,
      prices: (plan.plan_prices ?? []).map((p) => ({ currency: p.currency, amountMinor: Number(p.amount_minor), isActive: p.is_active })),
    },
    provider.currencies,
  )
  if (!price) throw new ApiError(400, 'VALIDATION_FAILED', 'This plan cannot be paid with this method. Choose another one.')

  const current = await loadCurrentSubscription(input.profile.id)
  const purpose = computeCheckoutPurpose(
    current
      ? { planId: current.plan.id, planPriceMinor: current.plan.priceMinor, effective: current.effective, scheduledPlanId: current.scheduledPlan?.id ?? null }
      : null,
    { planId: plan.id, priceMinor: Number(plan.price_minor) },
  )
  if (!purpose.ok) {
    throw new ApiError(
      409,
      'CONFLICT',
      purpose.reason === 'downgrade_must_be_scheduled'
        ? 'Moving to a cheaper plan is scheduled for your next renewal, not paid now.'
        : 'You scheduled a change to another plan. Keep your current plan first, or renew on the scheduled plan.',
      { reason: purpose.reason },
    )
  }

  const { data: payment, error: insertError } = await admin
    .from('payments')
    .insert({
      user_id: input.profile.id,
      plan_id: plan.id,
      provider: input.providerId,
      status: 'pending',
      purpose: purpose.purpose,
      amount_minor: price.amountMinor,
      currency: price.currency,
      period_months: plan.interval_months,
      idempotency_key: input.idempotencyKey,
    })
    .select('id, number')
    .single()
  if (insertError) {
    if (insertError.code === '23505') {
      const raced = await findByIdempotencyKey(input.profile.id, input.idempotencyKey)
      if (raced) return resumeExisting(raced, plan.id, input.providerId)
    }
    throw insertError
  }

  let redirectUrl: string
  try {
    ;({ redirectUrl } = await provider.createCheckout({
      payment: { id: payment.id, number: Number(payment.number), amountMinor: price.amountMinor, currency: price.currency },
      plan: { id: plan.id, code: plan.code, name: plan.name },
      user: { id: input.profile.id, email: input.profile.email, locale: input.profile.locale },
      returnUrl: siteUrl(returnPath(payment.id)),
    }))
  } catch (err) {
    console.error('[checkout] provider checkout failed', { provider: input.providerId, paymentId: payment.id, err })
    await cancelPendingPayment(payment.id, 'Checkout could not be created with the provider').catch(() => undefined)
    throw new ApiError(500, 'INTERNAL_ERROR', 'The payment provider could not start checkout. Try again or choose another method.')
  }

  const { error: urlError } = await admin.from('payments').update({ checkout_url: redirectUrl }).eq('id', payment.id)
  if (urlError) console.error('[checkout] could not store checkout_url', urlError)
  return { paymentId: payment.id, redirectUrl }
}

type ExistingPayment = { id: string; plan_id: string; provider: string; status: string; checkout_url: string | null }

async function findByIdempotencyKey(userId: string, key: string): Promise<ExistingPayment | null> {
  const { data, error } = await createAdminSupabase()
    .from('payments')
    .select('id, plan_id, provider, status, checkout_url')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle()
  if (error) throw error
  return data
}

function resumeExisting(p: ExistingPayment, planId: string, providerId: ProviderId) {
  if (p.plan_id !== planId || p.provider !== providerId) {
    throw new ApiError(409, 'CONFLICT', 'This checkout was already started for another plan. Reload the page and try again.')
  }
  const open = (p.status === 'pending' || p.status === 'processing') && p.checkout_url
  return { paymentId: p.id, redirectUrl: open ? p.checkout_url! : returnPath(p.id) }
}
