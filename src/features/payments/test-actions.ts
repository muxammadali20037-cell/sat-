'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getApiContext } from '@/lib/auth/session'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { siteUrl } from '@/lib/env'
import { getPaymentProvider, testProviderSecret } from '@/lib/payments/registry'
import { signTestPayload, TEST_SIGNATURE_HEADER, type TestEvent } from '@/lib/payments/test-provider'
import { findPayment } from './process'
import { returnPath } from './checkout'

const Input = z.object({ paymentId: z.uuid(), outcome: z.enum(['succeeded', 'failed']) })

/**
 * Dev-only: builds an HMAC-signed test event for the caller's own pending test payment and runs
 * it through the exact pipeline of POST /api/webhooks/test (signature check → event log →
 * amount check → SQL billing function). Refused entirely when the test provider is disabled.
 */
export async function simulateTestPaymentAction(input: { paymentId: string; outcome: 'succeeded' | 'failed' }): Promise<ActionResult<{ redirectUrl: string }>> {
  try {
    const { profile } = await getApiContext()
    const secret = testProviderSecret()
    if (!secret) return { ok: false, error: 'Test payments are disabled on this deployment.' }
    const parsed = Input.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid request.' }

    const payment = await findPayment({ id: parsed.data.paymentId })
    if (!payment || payment.userId !== profile.id || payment.provider !== 'test') return { ok: false, error: 'Payment not found.' }
    if (payment.status !== 'pending') return { ok: false, error: 'This payment is no longer pending.' }

    const event: TestEvent = {
      id: randomUUID(),
      type: parsed.data.outcome === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
      paymentId: payment.id,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      createdAt: Date.now(),
    }
    const body = JSON.stringify(event)
    const request = new Request(siteUrl('/api/webhooks/test'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TEST_SIGNATURE_HEADER]: signTestPayload(body, secret) },
      body,
    })
    const response = await getPaymentProvider('test').handleWebhook(request)
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { error?: string } | null
      return { ok: false, error: `Simulation rejected: ${detail?.error ?? response.status}` }
    }
    revalidatePath('/dashboard/subscription')
    return { ok: true, data: { redirectUrl: returnPath(payment.id) } }
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message, code: err.code }
    console.error('[test-provider] simulation failed', err)
    return { ok: false, error: 'Simulation failed. See server logs.' }
  }
}
