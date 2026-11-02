/**
 * Click (click.uz) — Shop API (Prepare / Complete callbacks) and the payment-button redirect.
 *
 * Sources:
 *  - Shop API request/response + sign_string: https://docs.click.uz/en/?p=15
 *  - Error codes returned by the merchant:     https://docs.click.uz/en/?p=9
 *  - Payment button / redirect URL:           https://docs.click.uz/en/?p=101
 *
 * Interpretation notes (where the docs are silent we pick the safe option):
 *  - sign_string is compared case-insensitively against the hex MD5 we compute, in constant time.
 *  - The signature is computed over the `amount` string exactly as received (Click sends a float).
 *  - Amounts are compared in minor units without floating point ("99000.00" → 9900000 tiyin).
 *  - merchant_prepare_id = merchant_confirm_id = our payment number (the merchant order id).
 *  - Complete is accepted only for a click_trans_id that passed our Prepare (else -6).
 *  - A repeated Complete for the click_trans_id that already paid the order answers 0 again
 *    (idempotent replay); a Complete for a different attempt on a paid order answers -4.
 *  - Complete with error < 0 cancels the pending order and answers -9, as the docs require.
 */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { majorToMinor, minorToMajorString } from './purpose'
import type { BillingOperations, PaymentEventLog, ProviderPayment } from './types'

export type ClickConfig = { serviceId: string; merchantId: string; secretKey: string; merchantUserId?: string | null }

export const CLICK_ERROR = {
  SUCCESS: { code: 0, note: 'Success' },
  SIGN_CHECK_FAILED: { code: -1, note: 'SIGN CHECK FAILED!' },
  INCORRECT_AMOUNT: { code: -2, note: 'Incorrect parameter amount' },
  ACTION_NOT_FOUND: { code: -3, note: 'Action not found' },
  ALREADY_PAID: { code: -4, note: 'Already paid' },
  ORDER_NOT_FOUND: { code: -5, note: 'User does not exist' },
  TRANSACTION_NOT_FOUND: { code: -6, note: 'Transaction does not exist' },
  FAILED_TO_UPDATE: { code: -7, note: 'Failed to update user' },
  REQUEST_ERROR: { code: -8, note: 'Error in request from click' },
  TRANSACTION_CANCELLED: { code: -9, note: 'Transaction cancelled' },
} as const

type ClickErrorKey = keyof typeof CLICK_ERROR

export type ClickResponse = {
  click_trans_id: number | string | null
  merchant_trans_id: string | null
  merchant_prepare_id?: number | null
  merchant_confirm_id?: number | null
  error: number
  error_note: string
}

export interface ClickRepository extends PaymentEventLog, Pick<BillingOperations, 'applyPayment' | 'cancelPayment'> {
  findPaymentByNumber(number: number): Promise<ProviderPayment | null>
  /** True when a signature-valid Prepare for this click_trans_id succeeded for this payment. */
  hasSuccessfulPrepare(paymentId: string, clickTransId: string): Promise<boolean>
}

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex')

/**
 * Prepare (action 0): md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
 * Complete (action 1): md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
 */
export function clickSignature(p: {
  clickTransId: string
  serviceId: string
  secretKey: string
  merchantTransId: string
  merchantPrepareId?: string | null
  amount: string
  action: string
  signTime: string
}): string {
  const prepare = p.action === '1' ? (p.merchantPrepareId ?? '') : ''
  return md5(`${p.clickTransId}${p.serviceId}${p.secretKey}${p.merchantTransId}${prepare}${p.amount}${p.action}${p.signTime}`)
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase(), 'utf8')
  const y = Buffer.from(b.toLowerCase(), 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

/** https://my.click.uz/services/pay?service_id&merchant_id&amount&transaction_param&return_url */
export function buildClickCheckoutUrl(config: ClickConfig, input: { amountMinor: number; orderNumber: number; returnUrl: string }): string {
  const params = new URLSearchParams({
    service_id: config.serviceId,
    merchant_id: config.merchantId,
    amount: minorToMajorString(input.amountMinor),
    transaction_param: String(input.orderNumber),
    return_url: input.returnUrl,
  })
  if (config.merchantUserId) params.set('merchant_user_id', config.merchantUserId)
  return `https://my.click.uz/services/pay?${params.toString()}`
}

const REQUIRED = ['click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'action', 'sign_time', 'sign_string', 'error'] as const

function toIdNumber(value: string | undefined): number | string | null {
  if (value === undefined || value === '') return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : value
}

/** Handles one Prepare/Complete callback. Never throws; always returns the JSON body Click expects. */
export async function handleClickCallback(
  input: URLSearchParams | Record<string, string>,
  deps: { config: ClickConfig; repo: ClickRepository },
): Promise<ClickResponse> {
  const p: Record<string, string> = {}
  const entries = input instanceof URLSearchParams ? Array.from(input.entries()) : Object.entries(input)
  for (const [k, v] of entries) p[k] = String(v).slice(0, 500)

  const base = { click_trans_id: toIdNumber(p.click_trans_id), merchant_trans_id: p.merchant_trans_id ?? null }
  const reply = (key: ClickErrorKey, extra: Partial<ClickResponse> = {}): ClickResponse => ({
    ...base,
    ...extra,
    error: CLICK_ERROR[key].code,
    error_note: CLICK_ERROR[key].note,
  })

  const action = p.action
  const missing = REQUIRED.filter((k) => p[k] === undefined || p[k] === '')
  if (action === '1' && !p.merchant_prepare_id) missing.push('merchant_prepare_id' as never)

  let signatureValid = false
  if (missing.length === 0) {
    const expected = clickSignature({
      clickTransId: p.click_trans_id!,
      serviceId: p.service_id!,
      secretKey: deps.config.secretKey,
      merchantTransId: p.merchant_trans_id!,
      merchantPrepareId: p.merchant_prepare_id,
      amount: p.amount!,
      action: action!,
      signTime: p.sign_time!,
    })
    signatureValid = p.service_id === deps.config.serviceId && safeEqualHex(expected, p.sign_string!)
  }

  const eventType = action === '0' ? 'prepare' : action === '1' ? 'complete' : `action_${(action ?? 'none').slice(0, 20)}`
  const orderNumber = /^\d{1,18}$/.test(p.merchant_trans_id ?? '') ? Number(p.merchant_trans_id) : null
  let lookupFailed = false
  const payment =
    signatureValid && orderNumber !== null
      ? await deps.repo.findPaymentByNumber(orderNumber).catch((err) => {
          console.error('[click] payment lookup failed', err)
          lookupFailed = true
          return null
        })
      : null

  const event = await safe(() =>
    deps.repo.recordEvent({
      provider: 'click',
      eventType,
      providerEventId: signatureValid ? `${eventType}:${p.click_trans_id}` : `invalid:${randomUUID()}`,
      signatureValid,
      payload: p,
      paymentId: payment?.id ?? null,
    }),
  )

  let response: ClickResponse
  try {
    if (missing.length > 0) response = reply('REQUEST_ERROR')
    else if (!signatureValid) response = reply('SIGN_CHECK_FAILED')
    else if (action !== '0' && action !== '1') response = reply('ACTION_NOT_FOUND')
    else if (lookupFailed) response = reply('FAILED_TO_UPDATE')
    else response = await process(action, p, payment, deps.repo, reply)
  } catch (err) {
    console.error('[click] processing failed', err)
    response = reply('FAILED_TO_UPDATE')
  }

  await safe(() => deps.repo.markEvent(event?.id ?? null, response.error === 0 ? null : `${response.error} ${response.error_note}`))
  return response
}

async function process(
  action: '0' | '1',
  p: Record<string, string>,
  payment: ProviderPayment | null,
  repo: ClickRepository,
  reply: (key: ClickErrorKey, extra?: Partial<ClickResponse>) => ClickResponse,
): Promise<ClickResponse> {
  if (!payment || payment.provider !== 'click') return reply('ORDER_NOT_FOUND')
  const amountMinor = majorToMinor(p.amount!)
  if (payment.currency !== 'UZS' || amountMinor === null || amountMinor !== payment.amountMinor) return reply('INCORRECT_AMOUNT')

  const clickTransId = p.click_trans_id!
  const clickError = Number(p.error)

  if (action === '0') {
    if (payment.status === 'succeeded' || payment.status === 'refunded') return reply('ALREADY_PAID')
    if (payment.status === 'canceled' || payment.status === 'failed') return reply('TRANSACTION_CANCELLED')
    return reply('SUCCESS', { merchant_prepare_id: payment.number })
  }

  // Complete
  if (p.merchant_prepare_id !== String(payment.number)) return reply('TRANSACTION_NOT_FOUND')
  if (!(await repo.hasSuccessfulPrepare(payment.id, clickTransId))) return reply('TRANSACTION_NOT_FOUND')

  if (payment.status === 'succeeded') {
    if (payment.providerTransactionId === clickTransId && clickError >= 0) {
      return reply('SUCCESS', { merchant_confirm_id: payment.number })
    }
    return reply('ALREADY_PAID')
  }
  if (payment.status === 'refunded') return reply('ALREADY_PAID')
  if (payment.status === 'canceled' || payment.status === 'failed') return reply('TRANSACTION_CANCELLED')

  if (!Number.isFinite(clickError) || clickError < 0) {
    await repo.cancelPayment(payment.id, `Click reported error ${p.error}: ${(p.error_note ?? '').slice(0, 200)}`)
    return reply('TRANSACTION_CANCELLED')
  }

  try {
    await repo.applyPayment(payment.id, clickTransId)
  } catch (err) {
    console.error('[click] apply failed', err)
    return reply('FAILED_TO_UPDATE')
  }
  return reply('SUCCESS', { merchant_confirm_id: payment.number })
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    console.error('[click] repository error', err)
    return null
  }
}
