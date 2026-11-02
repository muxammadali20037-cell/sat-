import { describe, expect, it } from 'vitest'
import { buildPaymeCheckoutUrl, handlePaymeRequest, paymeAuthorized, PAYME_TIMEOUT_MS, type PaymeRepository } from '@/lib/payments/payme'
import type { PaymentEventInput, ProviderPayment } from '@/lib/payments/types'

const KEY = 'test-key-123'
const config = { merchantId: '5e730e8e0b852a417aa49ceb', key: KEY, testMode: true }
const AUTH = `Basic ${Buffer.from(`Paycom:${KEY}`).toString('base64')}`
const T0 = 1_790_000_000_000

function payment(over: Partial<ProviderPayment> = {}): ProviderPayment {
  return {
    id: 'pay-1',
    number: 100001,
    userId: 'user-1',
    planId: 'plan-starter',
    provider: 'payme',
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
}

/** In-memory Payme repository mirroring the SQL functions and the conditional updates. */
function fakeRepo(payments: ProviderPayment[]) {
  const events: Array<PaymentEventInput & { id: string }> = []
  const calls = { apply: 0, cancel: 0, refund: [] as Array<{ amount: number; revoke: boolean }> }
  const byTx = (tx: string) => payments.find((p) => p.providerTransactionId === tx) ?? null
  const repo: PaymeRepository = {
    async recordEvent(input) {
      const dup = events.find((e) => e.providerEventId === input.providerEventId)
      if (dup) return { id: dup.id, duplicate: true, processed: true }
      events.push({ ...input, id: `ev-${events.length}` })
      return { id: `ev-${events.length - 1}`, duplicate: false, processed: false }
    },
    async markEvent() {},
    async findPaymentByNumber(n) {
      return payments.find((p) => p.number === n) ?? null
    },
    async findPaymentByTransactionId(tx) {
      const p = byTx(tx)
      return p ? { ...p } : null
    },
    async attachTransaction(id, tx, time) {
      const p = payments.find((x) => x.id === id)!
      if (p.status !== 'pending' || p.providerTransactionId) return false
      Object.assign(p, { providerTransactionId: tx, providerState: 1, providerCreateTimeMs: time, status: 'processing' })
      return true
    },
    async markPerformed(id, at) {
      const p = payments.find((x) => x.id === id)!
      if (p.providerState !== 1 || p.status !== 'succeeded') return false
      Object.assign(p, { providerState: 2, providerPerformTimeMs: at })
      return true
    },
    async markCanceled(id, to, at, reason) {
      const p = payments.find((x) => x.id === id)!
      if (p.providerState !== (to === -1 ? 1 : 2) || p.status !== (to === -1 ? 'canceled' : 'refunded')) return false
      Object.assign(p, { providerState: to, providerCancelTimeMs: at, providerCancelReason: reason })
      return true
    },
    async listStatement(from, to) {
      return payments
        .filter((p) => p.providerTransactionId && p.providerCreateTimeMs! >= from && p.providerCreateTimeMs! <= to)
        .sort((a, b) => a.providerCreateTimeMs! - b.providerCreateTimeMs!)
    },
    async applyPayment(id) {
      const p = payments.find((x) => x.id === id)!
      if (p.status === 'succeeded') return
      if (!['pending', 'processing', 'failed'].includes(p.status)) throw new Error('cannot apply')
      calls.apply += 1
      p.status = 'succeeded'
    },
    async failPayment() {},
    async cancelPayment(id) {
      const p = payments.find((x) => x.id === id)!
      if (['pending', 'processing', 'failed'].includes(p.status)) {
        calls.cancel += 1
        p.status = 'canceled'
      }
    },
    async refundPayment(id, amount, _reason, revoke) {
      const p = payments.find((x) => x.id === id)!
      if (p.status === 'refunded') return
      if (p.status !== 'succeeded') throw new Error('only succeeded')
      calls.refund.push({ amount, revoke })
      p.status = 'refunded'
    },
  }
  return { repo, events, calls }
}

let clock = T0
const rpc = (repo: PaymeRepository, method: string, params: Record<string, unknown>, authorization: string | null = AUTH) =>
  handlePaymeRequest({ bodyText: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params }), authorization }, { config, repo, now: () => clock })

type Ok = { result: Record<string, unknown> }
type Err = { error: { code: number; message: { ru: string; uz: string; en: string }; data?: string } }
const ok = (r: unknown) => (r as Ok).result
const err = (r: unknown) => (r as Err).error

const create = (repo: PaymeRepository, id = 'a'.repeat(24), time = T0, amount = 9_900_000, order = '100001') =>
  rpc(repo, 'CreateTransaction', { id, time, amount, account: { order_id: order } })

describe('Payme authorization and protocol errors', () => {
  it('accepts only Basic Paycom:<key>', () => {
    expect(paymeAuthorized(AUTH, KEY)).toBe(true)
    expect(paymeAuthorized(`Basic ${Buffer.from('Paycom:wrong').toString('base64')}`, KEY)).toBe(false)
    expect(paymeAuthorized(`Basic ${Buffer.from(`Other:${KEY}`).toString('base64')}`, KEY)).toBe(false)
    expect(paymeAuthorized(null, KEY)).toBe(false)
    expect(paymeAuthorized('Bearer x', KEY)).toBe(false)
  })

  it('answers -32504 with localized messages for every method when auth fails, and logs it unverified', async () => {
    const { repo, events } = fakeRepo([payment()])
    for (const method of ['CheckPerformTransaction', 'CreateTransaction', 'PerformTransaction', 'CancelTransaction', 'CheckTransaction', 'GetStatement']) {
      const res = await rpc(repo, method, {}, `Basic ${Buffer.from('Paycom:nope').toString('base64')}`)
      expect(err(res).code).toBe(-32504)
      expect(Object.keys(err(res).message).sort()).toEqual(['en', 'ru', 'uz'])
      expect((res as { id: unknown }).id).toBe(7)
    }
    expect(events.every((e) => !e.signatureValid && e.providerEventId.startsWith('invalid:'))).toBe(true)
  })

  it('answers -32700 for broken JSON, -32600 for a bad envelope, -32601 for unknown methods', async () => {
    const { repo } = fakeRepo([])
    expect(err(await handlePaymeRequest({ bodyText: '{oops', authorization: AUTH }, { config, repo })).code).toBe(-32700)
    expect(err(await handlePaymeRequest({ bodyText: JSON.stringify({ id: 1, method: 'X' }), authorization: AUTH }, { config, repo })).code).toBe(-32600)
    const unknown = err(await rpc(repo, 'ChargeEveryone', {}))
    expect(unknown.code).toBe(-32601)
    expect(unknown.data).toBe('ChargeEveryone')
  })

  it('builds the base64 checkout URL (test host in test mode)', () => {
    const url = buildPaymeCheckoutUrl(config, { amountMinor: 9_900_000, orderNumber: 100001, returnUrl: 'https://s.test/r?payment=x', locale: 'uz' })
    expect(url.startsWith('https://checkout.test.paycom.uz/')).toBe(true)
    // Standard base64 (as in Payme's documented example) may contain '/', so take everything after the host.
    const decoded = Buffer.from(url.slice('https://checkout.test.paycom.uz/'.length), 'base64').toString('utf8')
    expect(decoded).toBe(`m=${config.merchantId};ac.order_id=100001;a=9900000;c=https://s.test/r?payment=x;l=uz`)
    expect(buildPaymeCheckoutUrl({ ...config, testMode: false }, { amountMinor: 1, orderNumber: 1, returnUrl: 'x' }).startsWith('https://checkout.paycom.uz/')).toBe(true)
  })
})

describe('Payme methods', () => {
  it('CheckPerformTransaction: allow, wrong amount, unknown order, foreign order', async () => {
    const { repo } = fakeRepo([payment(), payment({ id: 'pay-2', number: 100002, provider: 'click' })])
    expect(ok(await rpc(repo, 'CheckPerformTransaction', { amount: 9_900_000, account: { order_id: '100001' } }))).toEqual({ allow: true })
    expect(err(await rpc(repo, 'CheckPerformTransaction', { amount: 100, account: { order_id: '100001' } })).code).toBe(-31001)
    const missing = err(await rpc(repo, 'CheckPerformTransaction', { amount: 9_900_000, account: { order_id: '42' } }))
    expect(missing.code).toBe(-31050)
    expect(missing.data).toBe('order_id')
    expect(err(await rpc(repo, 'CheckPerformTransaction', { amount: 9_900_000, account: { order_id: '100002' } })).code).toBe(-31050)
  })

  it('CreateTransaction is idempotent for the same id; a new transaction for a waiting order gets -31008', async () => {
    clock = T0 + 1000
    const p = payment()
    const { repo } = fakeRepo([p])
    const first = ok(await create(repo))
    expect(first).toEqual({ create_time: T0, transaction: '100001', state: 1 })
    expect(p.status).toBe('processing')
    expect(ok(await create(repo))).toEqual(first)
    expect(err(await create(repo, 'b'.repeat(24))).code).toBe(-31008)
    // CheckPerformTransaction now reports the order as busy (account error range).
    const busy = err(await rpc(repo, 'CheckPerformTransaction', { amount: 9_900_000, account: { order_id: '100001' } }))
    expect(busy.code).toBeLessThanOrEqual(-31050)
    expect(busy.code).toBeGreaterThanOrEqual(-31099)
  })

  it('CreateTransaction refuses a transaction older than 12 hours', async () => {
    clock = T0 + PAYME_TIMEOUT_MS + 1
    const { repo } = fakeRepo([payment()])
    expect(err(await create(repo)).code).toBe(-31008)
  })

  it('PerformTransaction applies once and repeats the stored result; unknown id → -31003', async () => {
    clock = T0 + 5000
    const p = payment()
    const { repo, calls } = fakeRepo([p])
    await create(repo)
    const performed = ok(await rpc(repo, 'PerformTransaction', { id: 'a'.repeat(24) }))
    expect(performed).toEqual({ transaction: '100001', perform_time: T0 + 5000, state: 2 })
    clock = T0 + 9000
    expect(ok(await rpc(repo, 'PerformTransaction', { id: 'a'.repeat(24) }))).toEqual(performed)
    expect(calls.apply).toBe(1)
    expect(p.status).toBe('succeeded')
    expect(err(await rpc(repo, 'PerformTransaction', { id: 'c'.repeat(24) })).code).toBe(-31003)
  })

  it('PerformTransaction after the 12-hour timeout cancels with reason 4 and answers -31008', async () => {
    clock = T0 + 1000
    const p = payment()
    const { repo, calls } = fakeRepo([p])
    await create(repo)
    clock = T0 + PAYME_TIMEOUT_MS + 1
    expect(err(await rpc(repo, 'PerformTransaction', { id: 'a'.repeat(24) })).code).toBe(-31008)
    expect(calls.apply).toBe(0)
    expect(p.status).toBe('canceled')
    expect(ok(await rpc(repo, 'CheckTransaction', { id: 'a'.repeat(24) }))).toMatchObject({ state: -1, reason: 4, perform_time: 0 })
  })

  it('CheckTransaction lazily times out a waiting transaction', async () => {
    clock = T0 + 1000
    const { repo } = fakeRepo([payment()])
    await create(repo)
    expect(ok(await rpc(repo, 'CheckTransaction', { id: 'a'.repeat(24) }))).toEqual({
      create_time: T0,
      perform_time: 0,
      cancel_time: 0,
      transaction: '100001',
      state: 1,
      reason: null,
    })
    clock = T0 + PAYME_TIMEOUT_MS + 10
    expect(ok(await rpc(repo, 'CheckTransaction', { id: 'a'.repeat(24) }))).toMatchObject({ state: -1, reason: 4, cancel_time: T0 + PAYME_TIMEOUT_MS + 10 })
  })

  it('CancelTransaction from state 1 → -1 (payment canceled), repeated calls return the same result', async () => {
    clock = T0 + 1000
    const p = payment()
    const { repo, calls } = fakeRepo([p])
    await create(repo)
    clock = T0 + 2000
    const canceled = ok(await rpc(repo, 'CancelTransaction', { id: 'a'.repeat(24), reason: 3 }))
    expect(canceled).toEqual({ transaction: '100001', cancel_time: T0 + 2000, state: -1 })
    clock = T0 + 3000
    expect(ok(await rpc(repo, 'CancelTransaction', { id: 'a'.repeat(24), reason: 3 }))).toEqual(canceled)
    expect(p.status).toBe('canceled')
    expect(calls.cancel).toBe(1)
    expect(err(await rpc(repo, 'PerformTransaction', { id: 'a'.repeat(24) })).code).toBe(-31008)
    expect(ok(await rpc(repo, 'CheckTransaction', { id: 'a'.repeat(24) }))).toMatchObject({ state: -1, reason: 3 })
  })

  it('CancelTransaction from state 2 → -2 records a full refund and revokes access', async () => {
    clock = T0 + 1000
    const p = payment()
    const { repo, calls } = fakeRepo([p])
    await create(repo)
    await rpc(repo, 'PerformTransaction', { id: 'a'.repeat(24) })
    clock = T0 + 60_000
    expect(ok(await rpc(repo, 'CancelTransaction', { id: 'a'.repeat(24), reason: 5 }))).toEqual({ transaction: '100001', cancel_time: T0 + 60_000, state: -2 })
    expect(calls.refund).toEqual([{ amount: 9_900_000, revoke: true }])
    expect(p.status).toBe('refunded')
    expect(ok(await rpc(repo, 'CheckTransaction', { id: 'a'.repeat(24) }))).toMatchObject({ state: -2, reason: 5, perform_time: T0 + 1000 })
  })

  it('GetStatement returns transactions created by Payme within [from, to], ascending', async () => {
    clock = T0 + 10_000
    const { repo } = fakeRepo([payment(), payment({ id: 'pay-2', number: 100002 }), payment({ id: 'pay-3', number: 100003 })])
    await create(repo, 'b'.repeat(24), T0 + 200, 9_900_000, '100002')
    await create(repo, 'a'.repeat(24), T0 + 100, 9_900_000, '100001')
    await create(repo, 'c'.repeat(24), T0 + 900, 9_900_000, '100003')
    const res = ok(await rpc(repo, 'GetStatement', { from: T0, to: T0 + 500 })) as { transactions: Array<Record<string, unknown>> }
    expect(res.transactions.map((t) => t.id)).toEqual(['a'.repeat(24), 'b'.repeat(24)])
    expect(res.transactions[0]).toMatchObject({ time: T0 + 100, amount: 9_900_000, account: { order_id: '100001' }, state: 1, transaction: '100001' })
  })
})
