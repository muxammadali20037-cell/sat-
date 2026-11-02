import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

/** Admin read models for /admin/payments. Callers must have passed requireRole(ADMIN_ROLES). */

export const ADMIN_PAGE_SIZE = 25

export type AdminPaymentFilters = {
  status?: string
  provider?: string
  from?: string
  to?: string
  q?: string
  page: number
}

export type AdminPaymentRow = {
  id: string
  number: number
  createdAt: string
  paidAt: string | null
  status: string
  provider: string
  purpose: string
  amountMinor: number
  currency: string
  userId: string
  email: string
  fullName: string
  planName: string
}

type JoinedPayment = {
  id: string
  number: number
  created_at: string
  paid_at: string | null
  status: string
  provider: string
  purpose: string
  amount_minor: number
  currency: string
  user_id: string
  profile: { email: string; full_name: string } | null
  plan: { name: string } | null
}

const SELECT =
  'id, number, created_at, paid_at, status, provider, purpose, amount_minor, currency, user_id, ' +
  'profile:profiles!payments_user_id_fkey(email, full_name), plan:plans!payments_plan_id_fkey(name)'

const mapRow = (r: JoinedPayment): AdminPaymentRow => ({
  id: r.id,
  number: Number(r.number),
  createdAt: r.created_at,
  paidAt: r.paid_at,
  status: r.status,
  provider: r.provider,
  purpose: r.purpose,
  amountMinor: Number(r.amount_minor),
  currency: r.currency,
  userId: r.user_id,
  email: r.profile?.email ?? '—',
  fullName: r.profile?.full_name ?? '',
  planName: r.plan?.name ?? '—',
})

/** Profile ids whose email contains `q` (case-insensitive), capped. */
export async function userIdsByEmail(q: string, cap = 200): Promise<string[]> {
  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`)
  const { data, error } = await createAdminSupabase().from('profiles').select('id').ilike('email', `%${escaped}%`).limit(cap)
  if (error) throw error
  return data.map((p) => p.id)
}

export async function listPaymentsForAdmin(f: AdminPaymentFilters): Promise<{ rows: AdminPaymentRow[]; total: number }> {
  let query = createAdminSupabase().from('payments').select(SELECT, { count: 'exact' })
  if (f.status) query = query.eq('status', f.status)
  if (f.provider) query = query.eq('provider', f.provider)
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) query = query.gte('created_at', `${f.from}T00:00:00Z`)
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) query = query.lt('created_at', new Date(new Date(`${f.to}T00:00:00Z`).getTime() + 86_400_000).toISOString())
  const q = f.q?.trim()
  if (q) {
    const asNumber = q.replace(/^#/, '')
    if (/^\d{1,18}$/.test(asNumber)) query = query.eq('number', Number(asNumber))
    else {
      const ids = await userIdsByEmail(q)
      if (ids.length === 0) return { rows: [], total: 0 }
      query = query.in('user_id', ids)
    }
  }
  const from = (f.page - 1) * ADMIN_PAGE_SIZE
  const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data as unknown as JoinedPayment[]).map(mapRow), total: count ?? 0 }
}

export async function listPaymentsForUser(userId: string, limit = 50): Promise<AdminPaymentRow[]> {
  const { data, error } = await createAdminSupabase()
    .from('payments')
    .select(SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as unknown as JoinedPayment[]).map(mapRow)
}

export type PaymentEventRow = {
  id: string
  createdAt: string
  provider: string
  eventType: string
  providerEventId: string
  signatureValid: boolean
  processedAt: string | null
  processingError: string | null
  payload: Json
  paymentId: string | null
}

const mapEvent = (e: {
  id: string
  created_at: string
  provider: string
  event_type: string
  provider_event_id: string
  signature_valid: boolean
  processed_at: string | null
  processing_error: string | null
  payload: Json
  payment_id: string | null
}): PaymentEventRow => ({
  id: e.id,
  createdAt: e.created_at,
  provider: e.provider,
  eventType: e.event_type,
  providerEventId: e.provider_event_id,
  signatureValid: e.signature_valid,
  processedAt: e.processed_at,
  processingError: e.processing_error,
  payload: e.payload,
  paymentId: e.payment_id,
})

export type AdminPaymentDetail = AdminPaymentRow & {
  planId: string
  subscriptionId: string | null
  periodMonths: number
  idempotencyKey: string
  checkoutUrl: string | null
  providerTransactionId: string | null
  providerState: number | null
  providerCreateTimeMs: number | null
  providerPerformTimeMs: number | null
  providerCancelTimeMs: number | null
  providerCancelReason: number | null
  failedReason: string | null
  refundedAt: string | null
  refundAmountMinor: number | null
  refundReason: string | null
  updatedAt: string
  events: PaymentEventRow[]
}

export async function getPaymentForAdmin(id: string): Promise<AdminPaymentDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = createAdminSupabase()
  const { data, error } = await admin
    .from('payments')
    .select(
      `${SELECT}, plan_id, subscription_id, period_months, idempotency_key, checkout_url, provider_transaction_id, provider_state, ` +
        'provider_create_time_ms, provider_perform_time_ms, provider_cancel_time_ms, provider_cancel_reason, failed_reason, refunded_at, ' +
        'refund_amount_minor, refund_reason, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const r = data as unknown as JoinedPayment & {
    plan_id: string
    subscription_id: string | null
    period_months: number
    idempotency_key: string
    checkout_url: string | null
    provider_transaction_id: string | null
    provider_state: number | null
    provider_create_time_ms: number | null
    provider_perform_time_ms: number | null
    provider_cancel_time_ms: number | null
    provider_cancel_reason: number | null
    failed_reason: string | null
    refunded_at: string | null
    refund_amount_minor: number | null
    refund_reason: string | null
    updated_at: string
  }
  const { data: events, error: eventsError } = await admin
    .from('payment_events')
    .select('id, created_at, provider, event_type, provider_event_id, signature_valid, processed_at, processing_error, payload, payment_id')
    .eq('payment_id', id)
    .order('created_at', { ascending: true })
    .limit(200)
  if (eventsError) throw eventsError
  const n = (v: number | null) => (v === null ? null : Number(v))
  return {
    ...mapRow(r),
    planId: r.plan_id,
    subscriptionId: r.subscription_id,
    periodMonths: r.period_months,
    idempotencyKey: r.idempotency_key,
    checkoutUrl: r.checkout_url,
    providerTransactionId: r.provider_transaction_id,
    providerState: r.provider_state,
    providerCreateTimeMs: n(r.provider_create_time_ms),
    providerPerformTimeMs: n(r.provider_perform_time_ms),
    providerCancelTimeMs: n(r.provider_cancel_time_ms),
    providerCancelReason: r.provider_cancel_reason,
    failedReason: r.failed_reason,
    refundedAt: r.refunded_at,
    refundAmountMinor: n(r.refund_amount_minor),
    refundReason: r.refund_reason,
    updatedAt: r.updated_at,
    events: events.map(mapEvent),
  }
}

/** Recent callbacks that could not be tied to a payment (bad signatures, unknown orders). */
export async function listUnmatchedEvents(limit = 10): Promise<PaymentEventRow[]> {
  const { data, error } = await createAdminSupabase()
    .from('payment_events')
    .select('id, created_at, provider, event_type, provider_event_id, signature_valid, processed_at, processing_error, payload, payment_id')
    .is('payment_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data.map(mapEvent)
}
