import { describe, expect, it } from 'vitest'
import { computeCheckoutPurpose, effectiveStatus, majorToMinor, minorToMajorString, pickPrice } from '@/lib/payments/purpose'
import {
  handleTestWebhook,
  isTestProviderEnabled,
  signTestPayload,
  verifyTestSignature,
  type TestEvent,
  type TestRepository,
} from '@/lib/payments/test-provider'
import type { ProviderPayment } from '@/lib/payments/types'

describe('test provider HMAC', () => {
  const secret = 'dev-secret'
  const body = JSON.stringify({ hello: 'world' })
  const now = 1_790_000_000

  it('verifies its own signature and rejects tampering, wrong secrets and stale timestamps', () => {
    const header = signTestPayload(body, secret, now)
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(verifyTestSignature(body, header, secret, now)).toBe(true)
    expect(verifyTestSignature(body + ' ', header, secret, now)).toBe(false)
    expect(verifyTestSignature(body, header, 'other', now)).toBe(false)
    expect(verifyTestSignature(body, header, secret, now + 301)).toBe(false)
    expect(verifyTestSignature(body, null, secret, now)).toBe(false)
    expect(verifyTestSignature(body, 't=abc,v1=zz', secret, now)).toBe(false)
  })

  it('is enabled only outside production with the flag and a secret', () => {
    expect(isTestProviderEnabled({ NODE_ENV: 'development', PAYMENTS_TEST_MODE: 'true', PAYMENTS_TEST_WEBHOOK_SECRET: 'x' })).toBe(true)
    expect(isTestProviderEnabled({ NODE_ENV: 'production', PAYMENTS_TEST_MODE: 'true', PAYMENTS_TEST_WEBHOOK_SECRET: 'x' })).toBe(false)
    expect(isTestProviderEnabled({ NODE_ENV: 'development', PAYMENTS_TEST_MODE: 'false', PAYMENTS_TEST_WEBHOOK_SECRET: 'x' })).toBe(false)
    expect(isTestProviderEnabled({ NODE_ENV: 'development', PAYMENTS_TEST_MODE: 'true' })).toBe(false)
  })

  function setup(over: Partial<ProviderPayment> = {}) {
    const p: ProviderPayment = {
      id: 'p1',
      number: 100100,
      userId: 'u1',
      planId: 'plan',
      provider: 'test',
      status: 'pending',
      amountMinor: 9_900_000,
      currency: 'UZS',
      providerTransactionId: null,
      providerState: null,
      providerCreateTimeMs: null,
      providerPerformTimeMs: null,
      providerCancelTimeMs: null,
      providerCancelReason: null,
      ...over,
    }
    const seen = new Map<string, { processed: boolean }>()
    const calls: string[] = []
    const repo: TestRepository = {
      async recordEvent(e) {
        const dup = seen.get(e.providerEventId)
        if (dup) return { id: e.providerEventId, duplicate: true, processed: dup.processed }
        seen.set(e.providerEventId, { processed: false })
        return { id: e.providerEventId, duplicate: false, processed: false }
      },
      async markEvent(id, error) {
        if (id) seen.set(id, { processed: !error })
      },
      async findPaymentById(id) {
        return id === p.id ? p : null
      },
      async applyPayment(_id, tx) {
        calls.push(`apply:${tx}`)
        p.status = 'succeeded'
      },
      async failPayment() {
        calls.push('fail')
        p.status = 'failed'
      },
    }
    return { p, repo, calls }
  }
  const event = (over: Partial<TestEvent> = {}): TestEvent => ({
    id: 'evt-1',
    type: 'payment.succeeded',
    paymentId: 'p1',
    amountMinor: 9_900_000,
    currency: 'UZS',
    createdAt: now * 1000,
    ...over,
  })

  it('runs a signed success through the pipeline once', async () => {
    const { repo, calls, p } = setup()
    const b = JSON.stringify(event())
    const res = await handleTestWebhook(b, signTestPayload(b, secret, now), { secret, repo, nowSec: now })
    expect(res.status).toBe(200)
    expect(p.status).toBe('succeeded')
    const replay = await handleTestWebhook(b, signTestPayload(b, secret, now), { secret, repo, nowSec: now })
    expect(replay.body).toMatchObject({ duplicate: true })
    expect(calls).toEqual(['apply:test:evt-1'])
  })

  it('refuses unsigned events and amount mismatches; failure marks the payment failed', async () => {
    const a = setup()
    const b = JSON.stringify(event())
    expect((await handleTestWebhook(b, 't=1,v1=00', { secret, repo: a.repo, nowSec: now })).status).toBe(401)
    expect(a.calls).toEqual([])

    const c = setup()
    const wrong = JSON.stringify(event({ id: 'evt-2', amountMinor: 1 }))
    expect((await handleTestWebhook(wrong, signTestPayload(wrong, secret, now), { secret, repo: c.repo, nowSec: now })).status).toBe(422)
    expect(c.calls).toEqual([])

    const d = setup()
    const fail = JSON.stringify(event({ id: 'evt-3', type: 'payment.failed' }))
    expect((await handleTestWebhook(fail, signTestPayload(fail, secret, now), { secret, repo: d.repo, nowSec: now })).status).toBe(200)
    expect(d.calls).toEqual(['fail'])
  })
})

describe('checkout purpose', () => {
  const STARTER = { planId: 'starter', priceMinor: 9_900_000 }
  const PRO = { planId: 'pro', priceMinor: 19_900_000 }
  const PREMIUM = { planId: 'premium', priceMinor: 39_900_000 }
  const onPro = (over: Partial<Parameters<typeof computeCheckoutPurpose>[0] & object> = {}) => ({
    planId: 'pro',
    planPriceMinor: 19_900_000,
    effective: 'active' as const,
    scheduledPlanId: null,
    ...over,
  })

  it('new without a subscription in effect', () => {
    expect(computeCheckoutPurpose(null, PRO)).toEqual({ ok: true, purpose: 'new' })
    expect(computeCheckoutPurpose(onPro({ effective: 'expired' }), STARTER)).toEqual({ ok: true, purpose: 'new' })
    expect(computeCheckoutPurpose(onPro({ effective: 'canceled' }), STARTER)).toEqual({ ok: true, purpose: 'new' })
  })

  it('renewal for the same plan (also during grace), upgrade for a pricier plan', () => {
    expect(computeCheckoutPurpose(onPro(), PRO)).toEqual({ ok: true, purpose: 'renewal' })
    expect(computeCheckoutPurpose(onPro({ effective: 'grace' }), PRO)).toEqual({ ok: true, purpose: 'renewal' })
    expect(computeCheckoutPurpose(onPro(), PREMIUM)).toEqual({ ok: true, purpose: 'upgrade' })
  })

  it('downgrades are scheduled, and a scheduled plan is what a renewal buys', () => {
    expect(computeCheckoutPurpose(onPro(), STARTER)).toEqual({ ok: false, reason: 'downgrade_must_be_scheduled' })
    expect(computeCheckoutPurpose(onPro({ scheduledPlanId: 'starter' }), STARTER)).toEqual({ ok: true, purpose: 'downgrade' })
    expect(computeCheckoutPurpose(onPro({ scheduledPlanId: 'starter' }), PRO)).toEqual({ ok: false, reason: 'scheduled_change_pending' })
  })
})

describe('billing helpers', () => {
  it('effectiveStatus mirrors the SQL function', () => {
    const now = new Date('2026-11-10T00:00:00Z')
    expect(effectiveStatus('active', '2026-11-11T00:00:00Z', 3, now)).toBe('active')
    expect(effectiveStatus('active', '2026-11-08T00:00:00Z', 3, now)).toBe('grace')
    expect(effectiveStatus('active', '2026-11-06T00:00:00Z', 3, now)).toBe('expired')
    expect(effectiveStatus('canceled', '2026-12-01T00:00:00Z', 3, now)).toBe('canceled')
  })

  it('pickPrice uses the base currency or an accepted alternate price', () => {
    const plan = { priceMinor: 9_900_000, currency: 'UZS', prices: [{ currency: 'USD', amountMinor: 900 }] }
    expect(pickPrice(plan, ['UZS'])).toEqual({ amountMinor: 9_900_000, currency: 'UZS' })
    expect(pickPrice(plan, ['USD'])).toEqual({ amountMinor: 900, currency: 'USD' })
    expect(pickPrice({ ...plan, prices: [{ currency: 'USD', amountMinor: 900, isActive: false }] }, ['USD'])).toBeNull()
    expect(pickPrice({ ...plan, prices: [] }, ['EUR'])).toBeNull()
  })

  it('parses and formats major amounts without floating point', () => {
    expect(majorToMinor('99000')).toBe(9_900_000)
    expect(majorToMinor('99000.0')).toBe(9_900_000)
    expect(majorToMinor('99000.05')).toBe(9_900_005)
    expect(majorToMinor('19.99')).toBe(1999)
    for (const bad of ['-1', '1e5', '1.234', '', 'abc', '1,5']) expect(majorToMinor(bad)).toBeNull()
    expect(minorToMajorString(9_900_000)).toBe('99000.00')
    expect(minorToMajorString(1999)).toBe('19.99')
  })
})
