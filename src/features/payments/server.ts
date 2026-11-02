import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import type { Db } from '@/lib/supabase/server'

export type MyPayment = {
  id: string
  number: number
  createdAt: string
  status: string
  amountMinor: number
  currency: string
  provider: string
  planName: string
}

/** Plan names by id (plans are not sensitive; inactive/private plans are invisible through RLS). */
export async function planNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data, error } = await createAdminSupabase().from('plans').select('id, name').in('id', unique)
  if (error) throw error
  return new Map(data.map((p) => [p.id, p.name]))
}

/** The signed-in student's own payments (user client → RLS `payments_read`). */
export async function getMyPayments(db: Db, userId: string, limit = 50): Promise<MyPayment[]> {
  const { data, error } = await db
    .from('payments')
    .select('id, number, created_at, status, amount_minor, currency, provider, plan_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const names = await planNames(data.map((p) => p.plan_id))
  return data.map((p) => ({
    id: p.id,
    number: Number(p.number),
    createdAt: p.created_at,
    status: p.status,
    amountMinor: Number(p.amount_minor),
    currency: p.currency,
    provider: p.provider,
    planName: names.get(p.plan_id) ?? '—',
  }))
}

export async function getMyPayment(db: Db, userId: string, paymentId: string): Promise<MyPayment | null> {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return null
  const { data, error } = await db
    .from('payments')
    .select('id, number, created_at, status, amount_minor, currency, provider, plan_id')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const names = await planNames([data.plan_id])
  return {
    id: data.id,
    number: Number(data.number),
    createdAt: data.created_at,
    status: data.status,
    amountMinor: Number(data.amount_minor),
    currency: data.currency,
    provider: data.provider,
    planName: names.get(data.plan_id) ?? '—',
  }
}
