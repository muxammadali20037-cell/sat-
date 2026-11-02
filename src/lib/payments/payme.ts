/**
 * Payme (Paycom) Merchant API — JSON-RPC 2.0 endpoint called by Payme Business.
 *
 * Sources (developer.help.paycom.uz):
 *  - Protocol / transport (POST, HTTP 200 always):  https://developer.help.paycom.uz/protokol-merchant-api/
 *  - Auth (Basic "Paycom:<key>", IP range):           https://developer.help.paycom.uz/protokol-merchant-api/skhema-vzaimodeystviya/
 *  - Response format (error.message {ru,uz,en}):      https://developer.help.paycom.uz/protokol-merchant-api/format-otveta/
 *  - Methods:                                         https://developer.help.paycom.uz/metody-merchant-api/createtransaction (and siblings)
 *  - Errors:                                          https://developer.help.paycom.uz/metody-merchant-api/oshibki-errors
 *  - Data types (State, Reason, Timestamp ms):        https://developer.help.paycom.uz/metody-merchant-api/tipy-dannykh/
 *  - Sandbox requirements:                            https://developer.help.paycom.uz/pesochnitsa
 *  - Checkout GET initialization (base64 params):     https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get/
 *
 * Interpretation notes:
 *  - Account field is `order_id` = payments.number (one payments row = one order = at most one Payme transaction).
 *  - A NEW CreateTransaction for an order that already has a Payme transaction in state 1 answers
 *    -31008 — this is what the official sandbox checks ("CreateTransaction c новой транзакцией и
 *    состоянием счета «В ожидании оплаты» — ответ с ошибкой -31008"). CheckPerformTransaction for
 *    such an order answers the account error -31052 (range -31050..-31099).
 *  - provider_create_time_ms stores Payme's `time` from CreateTransaction, because the 12-hour
 *    timeout (43 200 000 ms) and GetStatement's period filter are both defined on Payme's creation time.
 *  - Repeated Create/Perform/Cancel calls return the stored result (sandbox: "ответ должен совпадать
 *    с ответом из первого запроса").
 *  - CancelTransaction of a performed transaction (state 2) records a refund and revokes access
 *    (state -2). -31007 is used only when the refund cannot be recorded.
 *  - Fiscal receipt `detail` is not returned by CheckPerformTransaction (optional in the docs);
 *    add it if the cashbox has fiscalization enabled (see docs/PAYMENTS.md).
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import type { BillingOperations, PaymentEventLog, ProviderPayment } from './types'

export const PAYME_TIMEOUT_MS = 43_200_000

export type PaymeConfig = { merchantId: string; key: string; testMode: boolean }

type Localized = { ru: string; uz: string; en: string }

const M = {
  notPost: { ru: 'Метод запроса должен быть POST', uz: "So'rov usuli POST bo'lishi kerak", en: 'Request method must be POST' },
  parse: { ru: 'Ошибка разбора JSON', uz: 'JSON tahlilida xatolik', en: 'JSON parse error' },
  invalid: { ru: 'Неверный JSON-RPC объект', uz: "Noto'g'ri JSON-RPC obyekti", en: 'Invalid JSON-RPC request' },
  method: { ru: 'Метод не найден', uz: 'Usul topilmadi', en: 'Method not found' },
  auth: {
    ru: 'Недостаточно привилегий для выполнения метода',
    uz: 'Usulni bajarish uchun huquqlar yetarli emas',
    en: 'Insufficient privileges to perform this method',
  },
  system: { ru: 'Системная ошибка', uz: 'Tizim xatoligi', en: 'System error' },
  amount: { ru: 'Неверная сумма', uz: "Noto'g'ri summa", en: 'Incorrect amount' },
  orderNotFound: { ru: 'Заказ не найден', uz: 'Buyurtma topilmadi', en: 'Order not found' },
  orderNotPayable: {
    ru: 'Заказ уже оплачен или отменён',
    uz: "Buyurtma allaqachon to'langan yoki bekor qilingan",
    en: 'The order is already paid or canceled',
  },
  orderBusy: {
    ru: 'Заказ ожидает оплаты по другой транзакции',
    uz: "Buyurtma boshqa tranzaksiya bo'yicha to'lovni kutmoqda",
    en: 'The order is awaiting payment in another transaction',
  },
  txNotFound: { ru: 'Транзакция не найдена', uz: 'Tranzaksiya topilmadi', en: 'Transaction not found' },
  cannotPerform: { ru: 'Невозможно выполнить операцию', uz: "Amalni bajarib bo'lmaydi", en: 'Unable to perform the operation' },
  cannotCancel: { ru: 'Невозможно отменить транзакцию', uz: "Tranzaksiyani bekor qilib bo'lmaydi", en: 'The transaction cannot be canceled' },
} satisfies Record<string, Localized>

export const PAYME_ERROR = {
  NOT_POST: -32300,
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INSUFFICIENT_PRIVILEGE: -32504,
  SYSTEM: -32400,
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_CANCEL: -31007,
  CANNOT_PERFORM: -31008,
  ORDER_NOT_FOUND: -31050,
  ORDER_NOT_PAYABLE: -31051,
  ORDER_BUSY: -31052,
} as const

export type PaymeRpcError = { code: number; message: Localized; data?: string }
export type PaymeRpcResponse =
  | { jsonrpc: '2.0'; id: number | string | null; result: Record<string, unknown> }
  | { jsonrpc: '2.0'; id: number | string | null; error: PaymeRpcError }

class RpcFailure extends Error {
  constructor(
    public readonly rpc: PaymeRpcError,
  ) {
    super(rpc.message.en)
  }
}
const fail = (code: number, message: Localized, data?: string): never => {
  throw new RpcFailure({ code, message, ...(data !== undefined ? { data } : {}) })
}

export interface PaymeRepository extends PaymentEventLog, BillingOperations {
  findPaymentByNumber(number: number): Promise<ProviderPayment | null>
  findPaymentByTransactionId(paymeId: string): Promise<ProviderPayment | null>
  /** Atomically links a Payme transaction to a still-pending order (state 1). False if the order was taken meanwhile. */
  attachTransaction(paymentId: string, paymeId: string, paymeTimeMs: number): Promise<boolean>
  /** state 1 → 2 (only once the payment row is `succeeded`). */
  markPerformed(paymentId: string, performTimeMs: number): Promise<boolean>
  /** state 1 → -1 (payment `canceled`) or 2 → -2 (payment `refunded`). */
  markCanceled(paymentId: string, toState: -1 | -2, cancelTimeMs: number, reason: number): Promise<boolean>
  /** Payme transactions whose Payme creation time is within [from, to], ascending. */
  listStatement(fromMs: number, toMs: number): Promise<ProviderPayment[]>
}

export type PaymeDeps = { config: PaymeConfig; repo: PaymeRepository; now?: () => number }

/** Basic auth: "Paycom:<key>" (the login part is not secret; we accept any login, compare the key). */
export function paymeAuthorized(authorization: string | null, key: string): boolean {
  if (!authorization || !key) return false
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/.exec(authorization)
  if (!m) return false
  let decoded: string
  try {
    decoded = Buffer.from(m[1]!, 'base64').toString('utf8')
  } catch {
    return false
  }
  const sep = decoded.indexOf(':')
  if (sep < 0) return false
  const login = decoded.slice(0, sep)
  const given = Buffer.from(decoded.slice(sep + 1), 'utf8')
  const expected = Buffer.from(key, 'utf8')
  return login === 'Paycom' && given.length === expected.length && timingSafeEqual(given, expected)
}

/** https://checkout.paycom.uz/<base64("m=…;ac.order_id=…;a=…;c=…;l=…")>; checkout.test.paycom.uz in test mode. */
export function buildPaymeCheckoutUrl(
  config: PaymeConfig,
  input: { amountMinor: number; orderNumber: number; returnUrl: string; locale?: string },
): string {
  const lang = input.locale === 'uz' || input.locale === 'ru' ? input.locale : 'en'
  const params = [`m=${config.merchantId}`, `ac.order_id=${input.orderNumber}`, `a=${input.amountMinor}`, `c=${input.returnUrl}`, `l=${lang}`]
  const base = config.testMode ? 'https://checkout.test.paycom.uz' : 'https://checkout.paycom.uz'
  return `${base}/${Buffer.from(params.join(';'), 'utf8').toString('base64')}`
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Full request handling except the transport check (the route answers -32300 for non-POST). */
export async function handlePaymeRequest(
  input: { bodyText: string; authorization: string | null },
  deps: PaymeDeps,
): Promise<PaymeRpcResponse> {
  let id: number | string | null = null
  let body: unknown
  try {
    body = JSON.parse(input.bodyText)
  } catch {
    return { jsonrpc: '2.0', id: null, error: { code: PAYME_ERROR.PARSE, message: M.parse } }
  }
  if (isObj(body) && (typeof body.id === 'number' || typeof body.id === 'string')) id = body.id

  try {
    if (!paymeAuthorized(input.authorization, deps.config.key)) {
      await deps.repo
        .recordEvent({
          provider: 'payme',
          eventType: isObj(body) && typeof body.method === 'string' ? body.method.slice(0, 60) : 'unknown',
          providerEventId: `invalid:${randomUUID()}`,
          signatureValid: false,
          payload: (isObj(body) ? body : { raw: input.bodyText.slice(0, 2000) }) as never,
          paymentId: null,
        })
        .catch(() => null)
      fail(PAYME_ERROR.INSUFFICIENT_PRIVILEGE, M.auth)
    }
    if (!isObj(body) || typeof body.method !== 'string' || !isObj(body.params)) fail(PAYME_ERROR.INVALID_REQUEST, M.invalid)
    const { method, params } = body as { method: string; params: Record<string, unknown> }
    const result = await dispatch(method, params, deps)
    return { jsonrpc: '2.0', id, result }
  } catch (err) {
    if (err instanceof RpcFailure) return { jsonrpc: '2.0', id, error: err.rpc }
    console.error('[payme] system error', err)
    return { jsonrpc: '2.0', id, error: { code: PAYME_ERROR.SYSTEM, message: M.system } }
  }
}

async function dispatch(method: string, params: Record<string, unknown>, deps: PaymeDeps): Promise<Record<string, unknown>> {
  switch (method) {
    case 'CheckPerformTransaction':
      return checkPerformTransaction(params, deps)
    case 'CreateTransaction':
      return createTransaction(params, deps)
    case 'PerformTransaction':
      return performTransaction(params, deps)
    case 'CancelTransaction':
      return cancelTransaction(params, deps)
    case 'CheckTransaction':
      return checkTransaction(params, deps)
    case 'GetStatement':
      return getStatement(params, deps)
    default:
      return fail(PAYME_ERROR.METHOD_NOT_FOUND, M.method, method.slice(0, 60))
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseOrderNumber(account: unknown): number | null {
  if (!isObj(account)) return null
  const raw = account.order_id
  const s = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  return /^\d{1,18}$/.test(s) ? Number(s) : null
}

function requireTxId(params: Record<string, unknown>): string {
  const txId = params.id
  if (typeof txId !== 'string' || txId.length === 0 || txId.length > 64) return fail(PAYME_ERROR.INVALID_REQUEST, M.invalid)
  return txId
}

/** Validates the order for a new payment: exists, belongs to Payme, payable, amount matches. */
async function validateOrder(amount: unknown, account: unknown, deps: PaymeDeps): Promise<ProviderPayment> {
  if (!isInt(amount)) return fail(PAYME_ERROR.INVALID_REQUEST, M.invalid)
  const orderNumber = parseOrderNumber(account)
  if (orderNumber === null) return fail(PAYME_ERROR.ORDER_NOT_FOUND, M.orderNotFound, 'order_id')
  const payment = await deps.repo.findPaymentByNumber(orderNumber)
  if (!payment || payment.provider !== 'payme' || payment.currency !== 'UZS') return fail(PAYME_ERROR.ORDER_NOT_FOUND, M.orderNotFound, 'order_id')
  if (amount <= 0 || amount !== payment.amountMinor) return fail(PAYME_ERROR.INVALID_AMOUNT, M.amount)
  return payment
}

function txResult(p: ProviderPayment) {
  return {
    create_time: p.providerCreateTimeMs ?? 0,
    perform_time: p.providerPerformTimeMs ?? 0,
    cancel_time: p.providerCancelTimeMs ?? 0,
    transaction: String(p.number),
    state: p.providerState ?? 0,
    reason: p.providerCancelReason ?? null,
  }
}

async function reload(deps: PaymeDeps, txId: string): Promise<ProviderPayment> {
  const p = await deps.repo.findPaymentByTransactionId(txId)
  if (!p) return fail(PAYME_ERROR.TRANSACTION_NOT_FOUND, M.txNotFound)
  return p
}

/** Records the event, runs the method, stores the outcome. Duplicates (retries) are processed again — every step is idempotent. */
async function withEvent<T>(
  deps: PaymeDeps,
  method: string,
  txId: string,
  params: Record<string, unknown>,
  paymentId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  const event = await deps.repo
    .recordEvent({ provider: 'payme', eventType: method, providerEventId: `${method}:${txId}`, signatureValid: true, payload: { method, params } as never, paymentId })
    .catch((err) => {
      console.error('[payme] could not record event', err)
      return null
    })
  try {
    const result = await fn()
    await deps.repo.markEvent(event?.id ?? null, null).catch(() => undefined)
    return result
  } catch (err) {
    const message = err instanceof RpcFailure ? `${err.rpc.code} ${err.rpc.message.en}` : String((err as Error)?.message ?? err)
    await deps.repo.markEvent(event?.id ?? null, message.slice(0, 500)).catch(() => undefined)
    throw err
  }
}

/** Cancels a state-1 transaction that outlived Payme's 12-hour window (reason 4). */
async function cancelByTimeout(p: ProviderPayment, deps: PaymeDeps, now: number): Promise<void> {
  await deps.repo.cancelPayment(p.id, 'Payme transaction timed out (12 hours)')
  await deps.repo.markCanceled(p.id, -1, now, 4)
}

const isTimedOut = (p: ProviderPayment, now: number) => p.providerCreateTimeMs !== null && now - p.providerCreateTimeMs > PAYME_TIMEOUT_MS

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

async function checkPerformTransaction(params: Record<string, unknown>, deps: PaymeDeps) {
  const payment = await validateOrder(params.amount, params.account, deps)
  if (payment.status !== 'pending') {
    if (payment.status === 'processing' && payment.providerState === 1) return fail(PAYME_ERROR.ORDER_BUSY, M.orderBusy, 'order_id')
    return fail(PAYME_ERROR.ORDER_NOT_PAYABLE, M.orderNotPayable, 'order_id')
  }
  return { allow: true }
}

async function createTransaction(params: Record<string, unknown>, deps: PaymeDeps) {
  const now = deps.now?.() ?? Date.now()
  const txId = requireTxId(params)
  if (!isInt(params.time) || !isInt(params.amount)) return fail(PAYME_ERROR.INVALID_REQUEST, M.invalid)
  const paymeTime = params.time

  const existing = await deps.repo.findPaymentByTransactionId(txId)
  return withEvent(deps, 'CreateTransaction', txId, params, existing?.id ?? null, async () => {
    if (existing) {
      if (existing.providerState !== 1) return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
      if (isTimedOut(existing, now)) {
        await cancelByTimeout(existing, deps, now)
        return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
      }
      return { create_time: existing.providerCreateTimeMs ?? paymeTime, transaction: String(existing.number), state: 1 }
    }

    const payment = await validateOrder(params.amount, params.account, deps)
    if (payment.providerTransactionId && payment.providerTransactionId !== txId) {
      // Another Payme transaction already owns this order (sandbox expects -31008 while it awaits payment).
      if (payment.providerState === 1) return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
      return fail(PAYME_ERROR.ORDER_NOT_PAYABLE, M.orderNotPayable, 'order_id')
    }
    if (payment.status !== 'pending') return fail(PAYME_ERROR.ORDER_NOT_PAYABLE, M.orderNotPayable, 'order_id')
    if (now - paymeTime > PAYME_TIMEOUT_MS) return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)

    const attached = await deps.repo.attachTransaction(payment.id, txId, paymeTime)
    if (!attached) {
      const fresh = await deps.repo.findPaymentByTransactionId(txId)
      if (fresh?.providerState === 1) return { create_time: fresh.providerCreateTimeMs ?? paymeTime, transaction: String(fresh.number), state: 1 }
      return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
    }
    return { create_time: paymeTime, transaction: String(payment.number), state: 1 }
  })
}

async function performTransaction(params: Record<string, unknown>, deps: PaymeDeps) {
  const now = deps.now?.() ?? Date.now()
  const txId = requireTxId(params)
  const payment = await deps.repo.findPaymentByTransactionId(txId)
  if (!payment) return fail(PAYME_ERROR.TRANSACTION_NOT_FOUND, M.txNotFound)

  return withEvent(deps, 'PerformTransaction', txId, params, payment.id, async () => {
    if (payment.providerState === 2) {
      return { transaction: String(payment.number), perform_time: payment.providerPerformTimeMs ?? 0, state: 2 }
    }
    if (payment.providerState !== 1) return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
    if (isTimedOut(payment, now)) {
      await cancelByTimeout(payment, deps, now)
      return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
    }
    try {
      await deps.repo.applyPayment(payment.id, txId)
    } catch (err) {
      console.error('[payme] apply failed', err)
      return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
    }
    await deps.repo.markPerformed(payment.id, now)
    const fresh = await reload(deps, txId)
    if (fresh.providerState !== 2) return fail(PAYME_ERROR.CANNOT_PERFORM, M.cannotPerform)
    return { transaction: String(fresh.number), perform_time: fresh.providerPerformTimeMs ?? now, state: 2 }
  })
}

async function cancelTransaction(params: Record<string, unknown>, deps: PaymeDeps) {
  const now = deps.now?.() ?? Date.now()
  const txId = requireTxId(params)
  const reason = params.reason
  if (!isInt(reason)) return fail(PAYME_ERROR.INVALID_REQUEST, M.invalid)
  const payment = await deps.repo.findPaymentByTransactionId(txId)
  if (!payment) return fail(PAYME_ERROR.TRANSACTION_NOT_FOUND, M.txNotFound)

  return withEvent(deps, 'CancelTransaction', txId, params, payment.id, async () => {
    const done = (p: ProviderPayment) => ({ transaction: String(p.number), cancel_time: p.providerCancelTimeMs ?? now, state: p.providerState })

    if (payment.providerState === -1 || payment.providerState === -2) return done(payment)

    if (payment.providerState === 1) {
      await deps.repo.cancelPayment(payment.id, `Payme CancelTransaction reason ${reason}`)
      if (await deps.repo.markCanceled(payment.id, -1, now, reason)) return done(await reload(deps, txId))
      // Raced with PerformTransaction: fall through with the fresh state.
      const fresh = await reload(deps, txId)
      if (fresh.providerState !== 2) return done(fresh)
      return refundPerformed(fresh, reason, now, deps, done)
    }

    if (payment.providerState === 2) return refundPerformed(payment, reason, now, deps, done)
    return fail(PAYME_ERROR.CANNOT_CANCEL, M.cannotCancel)
  })
}

async function refundPerformed(
  payment: ProviderPayment,
  reason: number,
  now: number,
  deps: PaymeDeps,
  done: (p: ProviderPayment) => Record<string, unknown>,
) {
  try {
    await deps.repo.refundPayment(payment.id, payment.amountMinor, `Payme CancelTransaction reason ${reason} (refund)`, true)
  } catch (err) {
    console.error('[payme] refund failed', err)
    return fail(PAYME_ERROR.CANNOT_CANCEL, M.cannotCancel)
  }
  await deps.repo.markCanceled(payment.id, -2, now, reason)
  return done(await reload(deps, payment.providerTransactionId ?? ''))
}

async function checkTransaction(params: Record<string, unknown>, deps: PaymeDeps) {
  const now = deps.now?.() ?? Date.now()
  const txId = requireTxId(params)
  let payment = await deps.repo.findPaymentByTransactionId(txId)
  if (!payment) return fail(PAYME_ERROR.TRANSACTION_NOT_FOUND, M.txNotFound)
  if (payment.providerState === 1 && isTimedOut(payment, now)) {
    await cancelByTimeout(payment, deps, now)
    payment = await reload(deps, txId)
  }
  return txResult(payment)
}

async function getStatement(params: Record<string, unknown>, deps: PaymeDeps) {
  if (!isInt(params.from) || !isInt(params.to)) return fail(PAYME_ERROR.INVALID_REQUEST, M.invalid)
  const rows = await deps.repo.listStatement(params.from, params.to)
  return {
    transactions: rows.map((p) => ({
      id: p.providerTransactionId,
      time: p.providerCreateTimeMs,
      amount: p.amountMinor,
      account: { order_id: String(p.number) },
      ...txResult(p),
    })),
  }
}

/** Response for a non-POST request (Payme expects HTTP 200 with -32300). */
export function paymeNotPostResponse(): PaymeRpcResponse {
  return { jsonrpc: '2.0', id: null, error: { code: PAYME_ERROR.NOT_POST, message: M.notPost } }
}
