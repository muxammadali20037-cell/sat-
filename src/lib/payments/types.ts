/**
 * Payment provider abstraction (docs/SYSTEM_ARCHITECTURE.md §12, docs/PAYMENTS.md).
 *
 * Protocol logic (Click, Payme, Stripe, test) lives in pure modules that talk to the database
 * only through the small repository interfaces below, so signature/auth/state handling is unit
 * tested without a database. The Supabase-backed implementations live in
 * src/features/payments/repository.ts.
 */

export const PROVIDER_IDS = ['click', 'payme', 'stripe', 'test'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]
/** `manual` is used only for trusted admin actions (offline payments, granted access). */
export type PaymentProviderValue = ProviderId | 'manual'

export const CURRENCIES = ['UZS', 'USD', 'EUR'] as const
export type Currency = (typeof CURRENCIES)[number]

export const PAYMENT_STATUSES = ['pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)
}

/** The payment row as the protocol handlers see it. Amounts are in minor units (tiyin / cents). */
export type ProviderPayment = {
  id: string
  number: number
  userId: string
  planId: string
  provider: string
  status: PaymentStatus
  amountMinor: number
  currency: string
  providerTransactionId: string | null
  /** Payme transaction state 1 / 2 / -1 / -2 (null for other providers). */
  providerState: number | null
  providerCreateTimeMs: number | null
  providerPerformTimeMs: number | null
  providerCancelTimeMs: number | null
  providerCancelReason: number | null
}

export type CheckoutInput = {
  payment: { id: string; number: number; amountMinor: number; currency: Currency }
  plan: { id: string; code: string; name: string }
  user: { id: string; email: string; locale: string }
  /** Absolute URL of /dashboard/subscription/return?payment=<id> */
  returnUrl: string
}

export interface PaymentProvider {
  id: ProviderId
  /** Admin-facing label (student labels come from the subscription dictionary). */
  label: string
  /** Currencies this provider can charge. A plan is offered when it has a price in one of them. */
  currencies: readonly Currency[]
  isConfigured(): boolean
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string }>
  /** Verifies and processes a provider callback. Must never throw. */
  handleWebhook(request: Request): Promise<Response>
}

// ---------------------------------------------------------------------------
// Repository interfaces (implemented with the service-role client in production,
// with in-memory fakes in unit tests).
// ---------------------------------------------------------------------------

export type JsonValue = string | number | boolean | null | { [key: string]: JsonValue | undefined } | JsonValue[]

export type PaymentEventInput = {
  provider: PaymentProviderValue
  eventType: string
  /** Dedupe key. Unverified callbacks get a random `invalid:<uuid>` id so they can never block a real event. */
  providerEventId: string
  signatureValid: boolean
  payload: JsonValue
  paymentId: string | null
}

export type RecordedEvent = { id: string | null; duplicate: boolean; processed: boolean }

export interface PaymentEventLog {
  /** Inserts a payment_events row; on a duplicate provider event id returns the existing row with duplicate=true. */
  recordEvent(input: PaymentEventInput): Promise<RecordedEvent>
  /** Marks an event processed (error = null) or records the processing error. */
  markEvent(eventId: string | null, error: string | null): Promise<void>
}

/** Billing state transitions — each maps 1:1 to an idempotent SQL function. */
export interface BillingOperations {
  /** billing_apply_successful_payment(payment_id, provider_transaction_id) */
  applyPayment(paymentId: string, providerTransactionId: string | null): Promise<void>
  /** billing_mark_payment_failed */
  failPayment(paymentId: string, reason: string): Promise<void>
  /** billing_cancel_pending_payment */
  cancelPayment(paymentId: string, reason: string): Promise<void>
  /** billing_refund_payment (actor = null for provider-initiated refunds) */
  refundPayment(paymentId: string, amountMinor: number, reason: string, revokeAccess: boolean): Promise<void>
}
