/**
 * Stripe — one-month passes sold with Checkout Sessions in `payment` mode (no Stripe Billing,
 * no automatic renewals). Docs: https://docs.stripe.com/api/checkout/sessions/create,
 * https://docs.stripe.com/webhooks#verify-events, https://docs.stripe.com/checkout/fulfillment
 *
 * Handled events:
 *  - checkout.session.completed (payment_status = paid) and checkout.session.async_payment_succeeded → apply
 *  - checkout.session.async_payment_failed → failed; checkout.session.expired → canceled
 *  - charge.refunded → refund record; access is revoked only when the charge is fully refunded
 *    (a partial refund keeps access — an admin can revoke from /admin/payments).
 * Events are deduplicated by event.id (payment_events unique key); a duplicate that was already
 * processed is acknowledged without work.
 */
import Stripe from 'stripe'
import type { BillingOperations, CheckoutInput, PaymentEventLog, ProviderPayment } from './types'

export type StripeConfig = { secretKey: string; webhookSecret: string }

/** Sessions expire after 23 hours — one hour before the stale-payment cron cancels the pending row. */
export const STRIPE_SESSION_TTL_SECONDS = 23 * 3600

export interface StripeRepository extends PaymentEventLog, BillingOperations {
  findPaymentById(id: string): Promise<ProviderPayment | null>
  findPaymentByTransactionId(paymentIntentId: string): Promise<ProviderPayment | null>
}

let client: Stripe | null = null
export function stripeClient(secretKey: string): Stripe {
  if (!client) client = new Stripe(secretKey, { appInfo: { name: 'SAT MASTER' } })
  return client
}

export async function createStripeCheckoutSession(stripe: Stripe, input: CheckoutInput, nowMs = Date.now()): Promise<string> {
  const metadata = {
    payment_id: input.payment.id,
    payment_number: String(input.payment.number),
    user_id: input.user.id,
    plan_code: input.plan.code,
  }
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      client_reference_id: input.payment.id,
      customer_email: input.user.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.payment.currency.toLowerCase(),
            unit_amount: input.payment.amountMinor,
            product_data: { name: `SAT MASTER ${input.plan.name} — 1 month access (no automatic renewal)` },
          },
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: input.returnUrl,
      cancel_url: input.returnUrl,
      expires_at: Math.floor(nowMs / 1000) + STRIPE_SESSION_TTL_SECONDS,
    },
    { idempotencyKey: `checkout-session:${input.payment.id}` },
  )
  if (!session.url) throw new Error('Stripe did not return a checkout URL')
  return session.url
}

type SessionLike = {
  id: string
  client_reference_id: string | null
  metadata: Record<string, string> | null
  payment_status: string
  amount_total: number | null
  currency: string | null
  payment_intent: string | { id: string } | null
}
type ChargeLike = {
  id: string
  amount: number
  amount_refunded: number
  currency: string
  refunded: boolean
  payment_intent: string | { id: string } | null
  metadata: Record<string, string> | null
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : (v?.id ?? null))

export type StripeWebhookResult = { status: number; body: Record<string, unknown> }

/** Verifies the signature with the raw body, records the event, processes it. Never throws. */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
  deps: { webhookSecret: string; repo: StripeRepository },
): Promise<StripeWebhookResult> {
  let event: Stripe.Event
  try {
    if (!signature) throw new Error('missing stripe-signature header')
    event = Stripe.webhooks.constructEvent(rawBody, signature, deps.webhookSecret)
  } catch (err) {
    await deps.repo
      .recordEvent({
        provider: 'stripe',
        eventType: 'signature_invalid',
        providerEventId: `invalid:${crypto.randomUUID()}`,
        signatureValid: false,
        payload: { raw: rawBody.slice(0, 4000), error: String((err as Error)?.message ?? err).slice(0, 300) },
        paymentId: null,
      })
      .catch(() => null)
    return { status: 400, body: { error: 'Invalid signature' } }
  }
  return processStripeEvent(event, deps.repo)
}

const HANDLED = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
])

export async function processStripeEvent(event: Stripe.Event, repo: StripeRepository): Promise<StripeWebhookResult> {
  if (!HANDLED.has(event.type)) return { status: 200, body: { received: true, ignored: event.type } }

  const object = event.data.object as unknown as SessionLike & ChargeLike
  let payment: ProviderPayment | null = null
  try {
    if (event.type === 'charge.refunded') {
      const pi = idOf(object.payment_intent)
      payment = pi ? await repo.findPaymentByTransactionId(pi) : null
      if (!payment && object.metadata?.payment_id) payment = await repo.findPaymentById(object.metadata.payment_id)
    } else {
      const ref = object.client_reference_id ?? object.metadata?.payment_id ?? null
      payment = ref && /^[0-9a-f-]{36}$/i.test(ref) ? await repo.findPaymentById(ref) : null
    }
  } catch (err) {
    console.error('[stripe] payment lookup failed', err)
    return { status: 500, body: { error: 'Lookup failed' } }
  }

  const recorded = await repo.recordEvent({
    provider: 'stripe',
    eventType: event.type,
    providerEventId: event.id,
    signatureValid: true,
    payload: event as unknown as never,
    paymentId: payment?.id ?? null,
  })
  if (recorded.duplicate && recorded.processed) return { status: 200, body: { received: true, duplicate: true } }

  try {
    const outcome = await apply(event.type, object, payment, repo)
    await repo.markEvent(recorded.id, outcome.error ?? null)
    return { status: 200, body: { received: true, ...(outcome.error ? { note: outcome.error } : {}) } }
  } catch (err) {
    const message = String((err as Error)?.message ?? err).slice(0, 500)
    await repo.markEvent(recorded.id, message).catch(() => undefined)
    console.error('[stripe] processing failed', err)
    // 500 → Stripe retries; the retry is processed again because the event is not marked processed.
    return { status: 500, body: { error: 'Processing failed' } }
  }
}

async function apply(type: string, o: SessionLike & ChargeLike, payment: ProviderPayment | null, repo: StripeRepository): Promise<{ error?: string }> {
  if (!payment || payment.provider !== 'stripe') return { error: 'payment not found for this event' }

  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    if (o.payment_status !== 'paid') return { error: `session not paid yet (${o.payment_status})` }
    if (o.metadata?.payment_id && o.metadata.payment_id !== payment.id) return { error: 'metadata payment_id mismatch' }
    if (o.amount_total !== payment.amountMinor || (o.currency ?? '').toUpperCase() !== payment.currency) {
      return { error: `amount mismatch: got ${o.amount_total} ${o.currency}, expected ${payment.amountMinor} ${payment.currency}` }
    }
    if (payment.status === 'succeeded' || payment.status === 'refunded') return {}
    if (payment.status === 'canceled') {
      // Acknowledge (no retries) and leave a visible processing error for an admin to refund or grant access.
      return { error: 'paid after the payment was canceled — refund in Stripe or grant access manually' }
    }
    await repo.applyPayment(payment.id, idOf(o.payment_intent))
    return {}
  }
  if (type === 'checkout.session.async_payment_failed') {
    await repo.failPayment(payment.id, 'Stripe: asynchronous payment failed')
    return {}
  }
  if (type === 'checkout.session.expired') {
    await repo.cancelPayment(payment.id, 'Stripe: checkout session expired')
    return {}
  }
  // charge.refunded
  if (payment.status === 'refunded') return {}
  if (payment.status !== 'succeeded') return { error: `refund for a payment in status ${payment.status}` }
  const amount = Math.min(o.amount_refunded, payment.amountMinor)
  if (amount <= 0) return { error: 'refund amount is zero' }
  const full = o.refunded || o.amount_refunded >= payment.amountMinor
  await repo.refundPayment(payment.id, amount, `Stripe refund (charge ${o.id})`, full)
  return {}
}
