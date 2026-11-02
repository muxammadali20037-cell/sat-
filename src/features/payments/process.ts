import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { checkRateLimit, clientIp } from '@/lib/security/rate-limit'
import type { Json, Tables } from '@/types/database'
import type { PaymentEventInput, PaymentStatus, ProviderPayment, RecordedEvent } from '@/lib/payments/types'

/**
 * Shared payment processing core: the event log (payment_events) and the billing state
 * transitions. Every transition is one of the idempotent, row-locking SQL functions from
 * migration 0006 — this module never writes payments.status itself.
 */

export const PAYMENT_COLUMNS =
  'id, number, user_id, plan_id, provider, status, amount_minor, currency, provider_transaction_id, provider_state, provider_create_time_ms, provider_perform_time_ms, provider_cancel_time_ms, provider_cancel_reason'

type PaymentRow = Pick<
  Tables<'payments'>,
  | 'id'
  | 'number'
  | 'user_id'
  | 'plan_id'
  | 'provider'
  | 'status'
  | 'amount_minor'
  | 'currency'
  | 'provider_transaction_id'
  | 'provider_state'
  | 'provider_create_time_ms'
  | 'provider_perform_time_ms'
  | 'provider_cancel_time_ms'
  | 'provider_cancel_reason'
>

export function mapProviderPayment(row: PaymentRow): ProviderPayment {
  return {
    id: row.id,
    number: Number(row.number),
    userId: row.user_id,
    planId: row.plan_id,
    provider: row.provider,
    status: row.status as PaymentStatus,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    providerTransactionId: row.provider_transaction_id,
    providerState: row.provider_state,
    providerCreateTimeMs: row.provider_create_time_ms === null ? null : Number(row.provider_create_time_ms),
    providerPerformTimeMs: row.provider_perform_time_ms === null ? null : Number(row.provider_perform_time_ms),
    providerCancelTimeMs: row.provider_cancel_time_ms === null ? null : Number(row.provider_cancel_time_ms),
    providerCancelReason: row.provider_cancel_reason,
  }
}

const INVALID_EVENT_RULE = { bucket: 'webhook-invalid', limit: 30, windowSec: 60 }

/**
 * Inserts a payment_events row. Duplicate provider event ids (provider retries) return the
 * existing row with `duplicate: true`. Unverified callbacks are rate limited per IP before being
 * stored so that a flood of forged requests cannot fill the table.
 */
export async function recordPaymentEvent(input: PaymentEventInput): Promise<RecordedEvent> {
  const admin = createAdminSupabase()
  if (!input.signatureValid) {
    let ip = 'unknown'
    try {
      ip = await clientIp()
    } catch {
      // outside a request scope
    }
    const limit = await checkRateLimit(INVALID_EVENT_RULE, `${input.provider}:${ip}`)
    if (!limit.allowed) return { id: null, duplicate: false, processed: false }
  }
  const { data, error } = await admin
    .from('payment_events')
    .insert({
      provider: input.provider,
      event_type: input.eventType.slice(0, 100),
      provider_event_id: input.providerEventId.slice(0, 200),
      signature_valid: input.signatureValid,
      payload: input.payload as Json,
      payment_id: input.paymentId,
    })
    .select('id')
    .single()
  if (!error) return { id: data.id, duplicate: false, processed: false }
  if (error.code !== '23505') throw error
  const existing = await admin
    .from('payment_events')
    .select('id, processed_at, processing_error')
    .eq('provider', input.provider)
    .eq('provider_event_id', input.providerEventId.slice(0, 200))
    .single()
  if (existing.error) throw existing.error
  return { id: existing.data.id, duplicate: true, processed: existing.data.processed_at !== null && existing.data.processing_error === null }
}

export async function markPaymentEvent(eventId: string | null, processingError: string | null): Promise<void> {
  if (!eventId) return
  const { error } = await createAdminSupabase()
    .from('payment_events')
    .update({ processed_at: new Date().toISOString(), processing_error: processingError ? processingError.slice(0, 1000) : null })
    .eq('id', eventId)
  if (error) throw error
}

export async function applySuccessfulPayment(paymentId: string, providerTransactionId: string | null): Promise<string> {
  const { data, error } = await createAdminSupabase().rpc('billing_apply_successful_payment', {
    p_payment_id: paymentId,
    ...(providerTransactionId ? { p_provider_transaction_id: providerTransactionId } : {}),
  })
  if (error) throw error
  return data
}

export async function markPaymentFailed(paymentId: string, reason: string): Promise<void> {
  const { error } = await createAdminSupabase().rpc('billing_mark_payment_failed', { p_payment_id: paymentId, p_reason: reason })
  if (error) throw error
}

export async function cancelPendingPayment(paymentId: string, reason: string): Promise<void> {
  const { error } = await createAdminSupabase().rpc('billing_cancel_pending_payment', { p_payment_id: paymentId, p_reason: reason })
  if (error) throw error
}

export async function refundPayment(input: {
  paymentId: string
  amountMinor: number
  reason: string
  revokeAccess: boolean
  actorId: string | null
}): Promise<void> {
  const { error } = await createAdminSupabase().rpc('billing_refund_payment', {
    p_payment_id: input.paymentId,
    p_amount_minor: input.amountMinor,
    p_reason: input.reason,
    p_revoke_access: input.revokeAccess,
    ...(input.actorId ? { p_actor: input.actorId } : {}),
  })
  if (error) throw error
}

export async function findPayment(by: { id: string } | { number: number } | { provider: string; transactionId: string }): Promise<ProviderPayment | null> {
  const admin = createAdminSupabase()
  let query = admin.from('payments').select(PAYMENT_COLUMNS)
  if ('id' in by) query = query.eq('id', by.id)
  else if ('number' in by) query = query.eq('number', by.number)
  else query = query.eq('provider', by.provider).eq('provider_transaction_id', by.transactionId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? mapProviderPayment(data) : null
}
