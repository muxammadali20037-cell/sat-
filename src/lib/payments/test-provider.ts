/**
 * Development-only simulated provider. Exists only when PAYMENTS_TEST_MODE=true AND
 * NODE_ENV !== 'production' AND PAYMENTS_TEST_WEBHOOK_SECRET is set. Its checkout page
 * (/dashboard/subscription/test-checkout/[paymentId]) builds an HMAC-SHA256-signed event that
 * goes through the same verification + processing pipeline as /api/webhooks/test.
 * No money moves; every surface labels it "Test payment — no money is charged".
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { BillingOperations, PaymentEventLog, ProviderPayment } from './types'

export const TEST_SIGNATURE_HEADER = 'x-satmaster-test-signature'
export const TEST_SIGNATURE_TOLERANCE_SECONDS = 300

export type TestEvent = {
  id: string
  type: 'payment.succeeded' | 'payment.failed'
  paymentId: string
  amountMinor: number
  currency: string
  createdAt: number
}

export function isTestProviderEnabled(env: { NODE_ENV: string; PAYMENTS_TEST_MODE: string; PAYMENTS_TEST_WEBHOOK_SECRET?: string }): boolean {
  return env.NODE_ENV !== 'production' && env.PAYMENTS_TEST_MODE === 'true' && Boolean(env.PAYMENTS_TEST_WEBHOOK_SECRET)
}

const hmac = (secret: string, timestamp: number, body: string) => createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')

/** Header value `t=<unix seconds>,v1=<hex hmac of "<t>.<body>">` (same shape as Stripe's). */
export function signTestPayload(body: string, secret: string, timestampSec = Math.floor(Date.now() / 1000)): string {
  return `t=${timestampSec},v1=${hmac(secret, timestampSec, body)}`
}

export function verifyTestSignature(
  body: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = TEST_SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=', 2) as [string, string]))
  const t = Number(parts.t)
  const v1 = parts.v1
  if (!Number.isSafeInteger(t) || !v1 || !/^[0-9a-f]{64}$/.test(v1)) return false
  if (Math.abs(nowSec - t) > toleranceSec) return false
  const expected = Buffer.from(hmac(secret, t, body), 'hex')
  const given = Buffer.from(v1, 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export interface TestRepository extends PaymentEventLog, Pick<BillingOperations, 'applyPayment' | 'failPayment'> {
  findPaymentById(id: string): Promise<ProviderPayment | null>
}

export type TestWebhookResult = { status: number; body: Record<string, unknown> }

function parseEvent(body: string): TestEvent | null {
  try {
    const e = JSON.parse(body) as Partial<TestEvent>
    if (
      typeof e.id === 'string' &&
      (e.type === 'payment.succeeded' || e.type === 'payment.failed') &&
      typeof e.paymentId === 'string' &&
      Number.isSafeInteger(e.amountMinor) &&
      typeof e.currency === 'string'
    ) {
      return e as TestEvent
    }
  } catch {
    // fallthrough
  }
  return null
}

export async function handleTestWebhook(
  body: string,
  signature: string | null,
  deps: { secret: string; repo: TestRepository; nowSec?: number },
): Promise<TestWebhookResult> {
  const valid = verifyTestSignature(body, signature, deps.secret, deps.nowSec)
  const event = valid ? parseEvent(body) : null
  if (!valid || !event) {
    await deps.repo
      .recordEvent({
        provider: 'test',
        eventType: 'signature_invalid',
        providerEventId: `invalid:${crypto.randomUUID()}`,
        signatureValid: false,
        payload: { raw: body.slice(0, 2000) },
        paymentId: null,
      })
      .catch(() => null)
    return { status: valid ? 400 : 401, body: { error: valid ? 'Malformed event' : 'Invalid signature' } }
  }

  const payment = await deps.repo.findPaymentById(event.paymentId)
  const recorded = await deps.repo.recordEvent({
    provider: 'test',
    eventType: event.type,
    providerEventId: event.id,
    signatureValid: true,
    payload: event,
    paymentId: payment?.id ?? null,
  })
  if (recorded.duplicate && recorded.processed) return { status: 200, body: { received: true, duplicate: true } }

  let error: string | null = null
  try {
    if (!payment || payment.provider !== 'test') error = 'payment not found'
    else if (payment.amountMinor !== event.amountMinor || payment.currency !== event.currency) error = 'amount mismatch'
    else if (event.type === 'payment.succeeded') {
      if (payment.status !== 'succeeded') await deps.repo.applyPayment(payment.id, `test:${event.id}`)
    } else {
      await deps.repo.failPayment(payment.id, 'Simulated failure (test provider)')
    }
  } catch (err) {
    error = String((err as Error)?.message ?? err).slice(0, 300)
  }
  await deps.repo.markEvent(recorded.id, error)
  return { status: error ? 422 : 200, body: error ? { error } : { received: true } }
}
