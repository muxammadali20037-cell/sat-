import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { handleStripeWebhook, type StripeRepository } from '@/lib/payments/stripe'
import type { PaymentEventInput, ProviderPayment } from '@/lib/payments/types'

const SECRET = 'whsec_test_secret'
const PAYMENT_ID = '0b9f0d1e-1111-4a5b-8c9d-123456789abc'

function payment(over: Partial<ProviderPayment> = {}): ProviderPayment {
  return {
    id: PAYMENT_ID,
    number: 100010,
    userId: 'user-1',
    planId: 'plan-pro',
    provider: 'stripe',
    status: 'pending',
    amountMinor: 1900,
    currency: 'USD',
    providerTransactionId: null,
    providerState: null,
    providerCreateTimeMs: null,
    providerPerformTimeMs: null,
    providerCancelTimeMs: null,
    providerCancelReason: null,
    ...over,
  }
}

function fakeRepo(p: ProviderPayment) {
  const events: Array<PaymentEventInput & { id: string; processed: boolean; error: string | null }> = []
  const calls: string[] = []
  const repo: StripeRepository = {
    async recordEvent(input) {
      const dup = events.find((e) => e.providerEventId === input.providerEventId)
      if (dup) return { id: dup.id, duplicate: true, processed: dup.processed && !dup.error }
      events.push({ ...input, id: `ev-${events.length}`, processed: false, error: null })
      return { id: `ev-${events.length - 1}`, duplicate: false, processed: false }
    },
    async markEvent(id, error) {
      const e = events.find((x) => x.id === id)
      if (e) Object.assign(e, { processed: true, error })
    },
    async findPaymentById(id) {
      return id === p.id ? p : null
    },
    async findPaymentByTransactionId(tx) {
      return tx === p.providerTransactionId ? p : null
    },
    async applyPayment(_id, tx) {
      calls.push(`apply:${tx}`)
      Object.assign(p, { status: 'succeeded', providerTransactionId: tx })
    },
    async failPayment() {
      calls.push('fail')
      p.status = 'failed'
    },
    async cancelPayment() {
      calls.push('cancel')
      p.status = 'canceled'
    },
    async refundPayment(_id, amount, _reason, revoke) {
      calls.push(`refund:${amount}:${revoke}`)
      p.status = 'refunded'
    },
  }
  return { repo, events, calls }
}

function signed(event: Record<string, unknown>) {
  const payload = JSON.stringify(event)
  return { payload, header: Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) }
}

const sessionEvent = (id: string, type: string, session: Record<string, unknown>) => ({
  id,
  object: 'event',
  type,
  api_version: '2026-10-28',
  created: 1_790_000_000,
  data: {
    object: {
      id: 'cs_test_1',
      object: 'checkout.session',
      client_reference_id: PAYMENT_ID,
      metadata: { payment_id: PAYMENT_ID },
      payment_status: 'paid',
      amount_total: 1900,
      currency: 'usd',
      payment_intent: 'pi_123',
      ...session,
    },
  },
})

describe('Stripe webhook', () => {
  it('rejects an invalid signature with 400 and records an unverified event', async () => {
    const { repo, events, calls } = fakeRepo(payment())
    const { payload } = signed(sessionEvent('evt_1', 'checkout.session.completed', {}))
    const res = await handleStripeWebhook(payload, 't=1,v1=deadbeef', { webhookSecret: SECRET, repo })
    expect(res.status).toBe(400)
    expect(events[0]).toMatchObject({ signatureValid: false, paymentId: null })
    expect(events[0]!.providerEventId.startsWith('invalid:')).toBe(true)
    expect(calls).toEqual([])
    expect((await handleStripeWebhook(payload, null, { webhookSecret: SECRET, repo })).status).toBe(400)
  })

  it('applies a paid checkout.session.completed once (dedupe by event.id) with the payment intent id', async () => {
    const p = payment()
    const { repo, calls, events } = fakeRepo(p)
    const { payload, header } = signed(sessionEvent('evt_paid', 'checkout.session.completed', {}))
    expect((await handleStripeWebhook(payload, header, { webhookSecret: SECRET, repo })).status).toBe(200)
    expect(calls).toEqual(['apply:pi_123'])
    expect(events[0]).toMatchObject({ providerEventId: 'evt_paid', signatureValid: true, paymentId: PAYMENT_ID, processed: true, error: null })
    const replay = await handleStripeWebhook(payload, header, { webhookSecret: SECRET, repo })
    expect(replay.body).toMatchObject({ duplicate: true })
    expect(calls).toEqual(['apply:pi_123'])
  })

  it('does not apply when the amount or currency differs, or when the session is unpaid', async () => {
    const p = payment()
    const { repo, calls, events } = fakeRepo(p)
    for (const [id, over] of [
      ['evt_a', { amount_total: 100 }],
      ['evt_b', { currency: 'eur' }],
      ['evt_c', { payment_status: 'unpaid' }],
    ] as const) {
      const { payload, header } = signed(sessionEvent(id, 'checkout.session.completed', over))
      expect((await handleStripeWebhook(payload, header, { webhookSecret: SECRET, repo })).status).toBe(200)
    }
    expect(calls).toEqual([])
    expect(events.every((e) => e.error)).toBe(true)
    expect(p.status).toBe('pending')
  })

  it('marks async failures failed and expired sessions canceled', async () => {
    const p1 = payment()
    const a = fakeRepo(p1)
    const failed = signed(sessionEvent('evt_f', 'checkout.session.async_payment_failed', { payment_status: 'unpaid' }))
    await handleStripeWebhook(failed.payload, failed.header, { webhookSecret: SECRET, repo: a.repo })
    expect(a.calls).toEqual(['fail'])

    const p2 = payment()
    const b = fakeRepo(p2)
    const expired = signed(sessionEvent('evt_x', 'checkout.session.expired', { payment_status: 'unpaid' }))
    await handleStripeWebhook(expired.payload, expired.header, { webhookSecret: SECRET, repo: b.repo })
    expect(b.calls).toEqual(['cancel'])
  })

  it('records charge.refunded; access is revoked only on a full refund', async () => {
    const charge = (id: string, amountRefunded: number, refunded: boolean) => ({
      id,
      object: 'event',
      type: 'charge.refunded',
      created: 1,
      data: { object: { id: 'ch_1', object: 'charge', amount: 1900, amount_refunded: amountRefunded, refunded, currency: 'usd', payment_intent: 'pi_123', metadata: {} } },
    })
    const full = fakeRepo(payment({ status: 'succeeded', providerTransactionId: 'pi_123' }))
    const s1 = signed(charge('evt_r1', 1900, true))
    await handleStripeWebhook(s1.payload, s1.header, { webhookSecret: SECRET, repo: full.repo })
    expect(full.calls).toEqual(['refund:1900:true'])

    const partial = fakeRepo(payment({ status: 'succeeded', providerTransactionId: 'pi_123' }))
    const s2 = signed(charge('evt_r2', 500, false))
    await handleStripeWebhook(s2.payload, s2.header, { webhookSecret: SECRET, repo: partial.repo })
    expect(partial.calls).toEqual(['refund:500:false'])
  })

  it('acknowledges unrelated event types without work', async () => {
    const { repo, events } = fakeRepo(payment())
    const s = signed({ id: 'evt_o', object: 'event', type: 'customer.created', data: { object: {} } })
    const res = await handleStripeWebhook(s.payload, s.header, { webhookSecret: SECRET, repo })
    expect(res.status).toBe(200)
    expect(events).toHaveLength(0)
  })
})
