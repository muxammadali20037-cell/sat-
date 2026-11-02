import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildClickCheckoutUrl, clickSignature, handleClickCallback, type ClickRepository } from '@/lib/payments/click'
import type { PaymentEventInput, ProviderPayment } from '@/lib/payments/types'

const config = { serviceId: '123', merchantId: '456', secretKey: 's3cr3t' }

function payment(over: Partial<ProviderPayment> = {}): ProviderPayment {
  return {
    id: 'pay-1',
    number: 100001,
    userId: 'user-1',
    planId: 'plan-pro',
    provider: 'click',
    status: 'pending',
    amountMinor: 19_900_000,
    currency: 'UZS',
    providerTransactionId: null,
    providerState: null,
    providerCreateTimeMs: null,
    providerPerformTimeMs: null,
    providerCancelTimeMs: null,
    providerCancelReason: null,
    ...over,
  }
}

/** In-memory repository with the same semantics as the SQL functions. */
function fakeRepo(payments: ProviderPayment[]) {
  const events: Array<PaymentEventInput & { id: string; processed: boolean; error: string | null }> = []
  const calls = { apply: 0, cancel: 0 }
  const repo: ClickRepository = {
    async recordEvent(input) {
      const existing = events.find((e) => e.provider === input.provider && e.providerEventId === input.providerEventId)
      if (existing) return { id: existing.id, duplicate: true, processed: existing.processed && !existing.error }
      const row = { ...input, id: `ev-${events.length + 1}`, processed: false, error: null }
      events.push(row)
      return { id: row.id, duplicate: false, processed: false }
    },
    async markEvent(id, error) {
      const e = events.find((x) => x.id === id)
      if (e) Object.assign(e, { processed: true, error })
    },
    async findPaymentByNumber(n) {
      return payments.find((p) => p.number === n) ?? null
    },
    async hasSuccessfulPrepare(paymentId, clickTransId) {
      return events.some((e) => e.providerEventId === `prepare:${clickTransId}` && e.paymentId === paymentId && e.signatureValid && e.processed && !e.error)
    },
    async applyPayment(paymentId, tx) {
      const p = payments.find((x) => x.id === paymentId)!
      if (p.status === 'succeeded') return
      if (!['pending', 'processing', 'failed'].includes(p.status)) throw new Error('cannot apply')
      calls.apply += 1
      Object.assign(p, { status: 'succeeded', providerTransactionId: tx ?? p.providerTransactionId })
    },
    async cancelPayment(paymentId) {
      const p = payments.find((x) => x.id === paymentId)!
      if (['pending', 'processing', 'failed'].includes(p.status)) {
        calls.cancel += 1
        p.status = 'canceled'
      }
    },
  }
  return { repo, events, calls }
}

function callback(over: Record<string, string> = {}) {
  const base: Record<string, string> = {
    click_trans_id: '987654321',
    service_id: config.serviceId,
    click_paydoc_id: '555',
    merchant_trans_id: '100001',
    amount: '199000.00',
    action: '0',
    error: '0',
    error_note: 'Success',
    sign_time: '2026-11-02 10:00:00',
    ...over,
  }
  base.sign_string ??= clickSignature({
    clickTransId: base.click_trans_id!,
    serviceId: base.service_id!,
    secretKey: config.secretKey,
    merchantTransId: base.merchant_trans_id!,
    merchantPrepareId: base.merchant_prepare_id,
    amount: base.amount!,
    action: base.action!,
    signTime: base.sign_time!,
  })
  return base
}

describe('Click signature', () => {
  it('matches the documented MD5 formula for Prepare and Complete', () => {
    const prepare = clickSignature({ clickTransId: '1', serviceId: '2', secretKey: 'K', merchantTransId: '3', amount: '1000.00', action: '0', signTime: 'T' })
    expect(prepare).toBe(createHash('md5').update('12K31000.000T').digest('hex'))
    const complete = clickSignature({
      clickTransId: '1',
      serviceId: '2',
      secretKey: 'K',
      merchantTransId: '3',
      merchantPrepareId: '3',
      amount: '1000.00',
      action: '1',
      signTime: 'T',
    })
    expect(complete).toBe(createHash('md5').update('12K331000.001T').digest('hex'))
  })

  it('builds the my.click.uz redirect with N.NN amount and the order number', () => {
    const url = new URL(buildClickCheckoutUrl(config, { amountMinor: 9_900_000, orderNumber: 100042, returnUrl: 'https://x.test/r?payment=a' }))
    expect(url.origin + url.pathname).toBe('https://my.click.uz/services/pay')
    expect(url.searchParams.get('amount')).toBe('99000.00')
    expect(url.searchParams.get('transaction_param')).toBe('100042')
    expect(url.searchParams.get('service_id')).toBe('123')
    expect(url.searchParams.get('merchant_id')).toBe('456')
    expect(url.searchParams.get('return_url')).toBe('https://x.test/r?payment=a')
  })
})

describe('Click Prepare / Complete', () => {
  it('rejects a bad signature with -1 and logs an unverifiable event that cannot collide', async () => {
    const { repo, events } = fakeRepo([payment()])
    const res = await handleClickCallback(callback({ sign_string: 'deadbeef' }), { config, repo })
    expect(res.error).toBe(-1)
    expect(res.error_note).toBe('SIGN CHECK FAILED!')
    expect(events[0]!.signatureValid).toBe(false)
    expect(events[0]!.providerEventId.startsWith('invalid:')).toBe(true)
    expect(events[0]!.paymentId).toBeNull()
  })

  it('rejects a foreign service_id even when signed with our key (-1)', async () => {
    const { repo } = fakeRepo([payment()])
    expect((await handleClickCallback(callback({ service_id: '999' }), { config, repo })).error).toBe(-1)
  })

  it('answers -8 for missing parameters and -3 for an unknown action', async () => {
    const { repo } = fakeRepo([payment()])
    const missing = callback()
    delete missing.sign_time
    expect((await handleClickCallback(missing, { config, repo })).error).toBe(-8)
    expect((await handleClickCallback(callback({ action: '5' }), { config, repo })).error).toBe(-3)
  })

  it('answers -5 for an unknown order or an order of another provider, -2 for a wrong amount', async () => {
    const { repo } = fakeRepo([payment(), payment({ id: 'pay-2', number: 100002, provider: 'payme' })])
    expect((await handleClickCallback(callback({ merchant_trans_id: '999999' }), { config, repo })).error).toBe(-5)
    expect((await handleClickCallback(callback({ merchant_trans_id: '100002' }), { config, repo })).error).toBe(-5)
    expect((await handleClickCallback(callback({ amount: '199000.01' }), { config, repo })).error).toBe(-2)
    expect((await handleClickCallback(callback({ amount: '99000.00' }), { config, repo })).error).toBe(-2)
  })

  it('runs a full Prepare → Complete flow and applies the payment once', async () => {
    const p = payment()
    const { repo, calls } = fakeRepo([p])
    const prep = await handleClickCallback(callback({ amount: '199000' }), { config, repo })
    expect(prep).toMatchObject({ error: 0, error_note: 'Success', merchant_prepare_id: 100001, click_trans_id: 987654321, merchant_trans_id: '100001' })

    const done = await handleClickCallback(callback({ action: '1', merchant_prepare_id: '100001', amount: '199000' }), { config, repo })
    expect(done).toMatchObject({ error: 0, merchant_confirm_id: 100001 })
    expect(p.status).toBe('succeeded')
    expect(p.providerTransactionId).toBe('987654321')

    // Click retries the same Complete: idempotent success, no second application.
    const again = await handleClickCallback(callback({ action: '1', merchant_prepare_id: '100001', amount: '199000' }), { config, repo })
    expect(again.error).toBe(0)
    expect(calls.apply).toBe(1)

    // A new Prepare for a paid order: -4 Already paid.
    expect((await handleClickCallback(callback({ click_trans_id: '111' }), { config, repo })).error).toBe(-4)
  })

  it('refuses Complete without a successful Prepare, or with a foreign merchant_prepare_id (-6)', async () => {
    const { repo, calls } = fakeRepo([payment()])
    expect((await handleClickCallback(callback({ action: '1', merchant_prepare_id: '100001' }), { config, repo })).error).toBe(-6)
    await handleClickCallback(callback(), { config, repo })
    expect((await handleClickCallback(callback({ action: '1', merchant_prepare_id: '100002' }), { config, repo })).error).toBe(-6)
    expect(calls.apply).toBe(0)
  })

  it('cancels the order when Click reports an error on Complete (-9), and stays canceled', async () => {
    const p = payment()
    const { repo, calls } = fakeRepo([p])
    await handleClickCallback(callback(), { config, repo })
    const res = await handleClickCallback(callback({ action: '1', merchant_prepare_id: '100001', error: '-5017', error_note: 'Insufficient funds' }), { config, repo })
    expect(res.error).toBe(-9)
    expect(p.status).toBe('canceled')
    expect(calls.cancel).toBe(1)
    expect(calls.apply).toBe(0)
    expect((await handleClickCallback(callback({ click_trans_id: '222' }), { config, repo })).error).toBe(-9)
  })

  it('answers -7 when applying fails', async () => {
    const p = payment()
    const { repo } = fakeRepo([p])
    await handleClickCallback(callback(), { config, repo })
    repo.applyPayment = async () => {
      throw new Error('db down')
    }
    expect((await handleClickCallback(callback({ action: '1', merchant_prepare_id: '100001' }), { config, repo })).error).toBe(-7)
  })
})
