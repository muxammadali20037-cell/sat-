import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import type { ClickRepository } from '@/lib/payments/click'
import type { PaymeRepository } from '@/lib/payments/payme'
import type { StripeRepository } from '@/lib/payments/stripe'
import type { TestRepository } from '@/lib/payments/test-provider'
import type { BillingOperations, PaymentEventLog } from '@/lib/payments/types'
import {
  PAYMENT_COLUMNS,
  applySuccessfulPayment,
  cancelPendingPayment,
  findPayment,
  mapProviderPayment,
  markPaymentEvent,
  markPaymentFailed,
  recordPaymentEvent,
  refundPayment,
} from './process'

/** Service-role implementations of the protocol repositories (src/lib/payments/*). */

const eventLog: PaymentEventLog = {
  recordEvent: recordPaymentEvent,
  markEvent: markPaymentEvent,
}

const billing: BillingOperations = {
  applyPayment: async (paymentId, tx) => {
    await applySuccessfulPayment(paymentId, tx)
  },
  failPayment: markPaymentFailed,
  cancelPayment: cancelPendingPayment,
  refundPayment: (paymentId, amountMinor, reason, revokeAccess) => refundPayment({ paymentId, amountMinor, reason, revokeAccess, actorId: null }),
}

export const clickRepository: ClickRepository = {
  ...eventLog,
  applyPayment: billing.applyPayment,
  cancelPayment: billing.cancelPayment,
  findPaymentByNumber: (number) => findPayment({ number }),
  async hasSuccessfulPrepare(paymentId, clickTransId) {
    const { data, error } = await createAdminSupabase()
      .from('payment_events')
      .select('id')
      .eq('provider', 'click')
      .eq('provider_event_id', `prepare:${clickTransId}`)
      .eq('payment_id', paymentId)
      .eq('signature_valid', true)
      .not('processed_at', 'is', null)
      .is('processing_error', null)
      .limit(1)
    if (error) throw error
    return data.length > 0
  },
}

export const paymeRepository: PaymeRepository = {
  ...eventLog,
  ...billing,
  findPaymentByNumber: (number) => findPayment({ number }),
  findPaymentByTransactionId: (paymeId) => findPayment({ provider: 'payme', transactionId: paymeId }),
  async attachTransaction(paymentId, paymeId, paymeTimeMs) {
    const { data, error } = await createAdminSupabase()
      .from('payments')
      .update({ provider_transaction_id: paymeId, provider_state: 1, provider_create_time_ms: paymeTimeMs, status: 'processing' })
      .eq('id', paymentId)
      .eq('status', 'pending')
      .is('provider_transaction_id', null)
      .select('id')
    if (error) {
      if (error.code === '23505') return false
      throw error
    }
    return data.length > 0
  },
  async markPerformed(paymentId, performTimeMs) {
    const { data, error } = await createAdminSupabase()
      .from('payments')
      .update({ provider_state: 2, provider_perform_time_ms: performTimeMs })
      .eq('id', paymentId)
      .eq('provider_state', 1)
      .eq('status', 'succeeded')
      .select('id')
    if (error) throw error
    return data.length > 0
  },
  async markCanceled(paymentId, toState, cancelTimeMs, reason) {
    const { data, error } = await createAdminSupabase()
      .from('payments')
      .update({ provider_state: toState, provider_cancel_time_ms: cancelTimeMs, provider_cancel_reason: reason })
      .eq('id', paymentId)
      .eq('provider_state', toState === -1 ? 1 : 2)
      .eq('status', toState === -1 ? 'canceled' : 'refunded')
      .select('id')
    if (error) throw error
    return data.length > 0
  },
  async listStatement(fromMs, toMs) {
    const { data, error } = await createAdminSupabase()
      .from('payments')
      .select(PAYMENT_COLUMNS)
      .eq('provider', 'payme')
      .not('provider_transaction_id', 'is', null)
      .gte('provider_create_time_ms', fromMs)
      .lte('provider_create_time_ms', toMs)
      .order('provider_create_time_ms', { ascending: true })
      .limit(5000)
    if (error) throw error
    return data.map(mapProviderPayment)
  },
}

export const stripeRepository: StripeRepository = {
  ...eventLog,
  ...billing,
  findPaymentById: (id) => findPayment({ id }),
  findPaymentByTransactionId: (pi) => findPayment({ provider: 'stripe', transactionId: pi }),
}

export const testRepository: TestRepository = {
  ...eventLog,
  applyPayment: billing.applyPayment,
  failPayment: billing.failPayment,
  findPaymentById: (id) => findPayment({ id }),
}
