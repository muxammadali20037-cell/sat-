import { z } from 'zod'
import { route } from '@/lib/api/route'
import { notFoundError } from '@/lib/api/errors'

const Id = z.uuid()

/**
 * Status of one of the caller's own payments (RLS + explicit owner filter). Display only — the
 * return-from-provider page polls this; it never changes anything.
 */
export const GET = route({
  auth: 'user',
  handler: async ({ params, db, user }) => {
    const id = Id.safeParse(params.id)
    if (!id.success) throw notFoundError('Payment')
    const { data, error } = await db
      .from('payments')
      .select('id, number, status, provider, amount_minor, currency, purpose, paid_at, created_at, updated_at, refunded_at, plan_id')
      .eq('id', id.data)
      .eq('user_id', user.id)
      .maybeSingle()
    if (error) throw error
    if (!data) throw notFoundError('Payment')
    return {
      id: data.id,
      number: Number(data.number),
      status: data.status,
      provider: data.provider,
      amountMinor: Number(data.amount_minor),
      currency: data.currency,
      purpose: data.purpose,
      paidAt: data.paid_at,
      refundedAt: data.refunded_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  },
})
