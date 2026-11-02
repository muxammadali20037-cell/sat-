import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { FEATURE_KEYS, type FeatureKey } from '@/features/entitlements/server'
import { effectiveStatus, type EffectiveStatus } from '@/lib/payments/purpose'
import { ADMIN_PAGE_SIZE, userIdsByEmail } from '@/features/payments/admin'
import { getGraceDays } from './server'

/** Admin read models for /admin/subscriptions. Callers must have passed requireRole(ADMIN_ROLES). */

export type AdminSubscriptionFilters = { state?: string; plan?: string; q?: string; page: number }

export type AdminSubscriptionRow = {
  id: string
  userId: string
  email: string
  fullName: string
  planCode: string
  planName: string
  status: string
  effective: EffectiveStatus
  periodStart: string
  periodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  scheduledPlanName: string | null
  lastProvider: string | null
  createdAt: string
  updatedAt: string
}

type Joined = {
  id: string
  user_id: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  canceled_at: string | null
  last_provider: string | null
  created_at: string
  updated_at: string
  profile: { email: string; full_name: string } | null
  plan: { code: string; name: string } | null
  scheduled: { name: string } | null
}

const SELECT =
  'id, user_id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, last_provider, created_at, updated_at, ' +
  'profile:profiles!subscriptions_user_id_fkey(email, full_name), plan:plans!subscriptions_plan_id_fkey(code, name), ' +
  'scheduled:plans!subscriptions_scheduled_plan_id_fkey(name)'

function mapRow(r: Joined, graceDays: number, now: Date): AdminSubscriptionRow {
  return {
    id: r.id,
    userId: r.user_id,
    email: r.profile?.email ?? '—',
    fullName: r.profile?.full_name ?? '',
    planCode: r.plan?.code ?? '',
    planName: r.plan?.name ?? '—',
    status: r.status,
    effective: effectiveStatus(r.status, r.current_period_end, graceDays, now),
    periodStart: r.current_period_start,
    periodEnd: r.current_period_end,
    cancelAtPeriodEnd: r.cancel_at_period_end,
    canceledAt: r.canceled_at,
    scheduledPlanName: r.scheduled?.name ?? null,
    lastProvider: r.last_provider,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listSubscriptionsForAdmin(f: AdminSubscriptionFilters): Promise<{ rows: AdminSubscriptionRow[]; total: number }> {
  const admin = createAdminSupabase()
  const graceDays = await getGraceDays()
  const now = new Date()
  const nowIso = now.toISOString()
  const graceCutoff = new Date(now.getTime() - graceDays * 86_400_000).toISOString()
  let query = admin.from('subscriptions').select(SELECT, { count: 'exact' })
  switch (f.state) {
    case 'active':
      query = query.eq('status', 'active').gt('current_period_end', nowIso)
      break
    case 'grace':
      query = query.eq('status', 'active').lte('current_period_end', nowIso).gt('current_period_end', graceCutoff)
      break
    case 'expired':
      query = query.or(`status.eq.expired,and(status.eq.active,current_period_end.lte.${graceCutoff})`)
      break
    case 'canceled':
      query = query.eq('status', 'canceled')
      break
    case 'canceling':
      query = query.eq('status', 'active').eq('cancel_at_period_end', true)
      break
  }
  if (f.plan) {
    const { data: plan } = await admin.from('plans').select('id').eq('code', f.plan).maybeSingle()
    if (!plan) return { rows: [], total: 0 }
    query = query.eq('plan_id', plan.id)
  }
  if (f.q?.trim()) {
    const ids = await userIdsByEmail(f.q.trim())
    if (ids.length === 0) return { rows: [], total: 0 }
    query = query.in('user_id', ids)
  }
  const from = (f.page - 1) * ADMIN_PAGE_SIZE
  const { data, error, count } = await query.order('current_period_end', { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data as unknown as Joined[]).map((r) => mapRow(r, graceDays, now)), total: count ?? 0 }
}

export async function getSubscriptionForAdmin(id: string): Promise<AdminSubscriptionRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [{ data, error }, graceDays] = await Promise.all([
    createAdminSupabase().from('subscriptions').select(SELECT).eq('id', id).maybeSingle(),
    getGraceDays(),
  ])
  if (error) throw error
  return data ? mapRow(data as unknown as Joined, graceDays, new Date()) : null
}

export async function listSubscriptionsForUser(userId: string): Promise<AdminSubscriptionRow[]> {
  const [{ data, error }, graceDays] = await Promise.all([
    createAdminSupabase().from('subscriptions').select(SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    getGraceDays(),
  ])
  if (error) throw error
  const now = new Date()
  return (data as unknown as Joined[]).map((r) => mapRow(r, graceDays, now))
}

export type AdminPlan = {
  id: string
  code: string
  name: string
  description: string
  priceMinor: number
  currency: string
  intervalMonths: number
  isActive: boolean
  isPublic: boolean
  highlight: boolean
  position: number
  usdPrice: { amountMinor: number; isActive: boolean } | null
  features: Record<FeatureKey, { enabled: boolean; limit: number | null }>
}

export async function listPlansForAdmin(): Promise<AdminPlan[]> {
  const { data, error } = await createAdminSupabase()
    .from('plans')
    .select(
      'id, code, name, description, price_minor, currency, interval_months, is_active, is_public, highlight, position, ' +
        'plan_prices(currency, amount_minor, is_active), plan_features(feature_key, is_enabled, limit_value)',
    )
    .order('position')
  if (error) throw error
  type Row = {
    id: string
    code: string
    name: string
    description: string
    price_minor: number
    currency: string
    interval_months: number
    is_active: boolean
    is_public: boolean
    highlight: boolean
    position: number
    plan_prices: Array<{ currency: string; amount_minor: number; is_active: boolean }> | null
    plan_features: Array<{ feature_key: string; is_enabled: boolean; limit_value: number | null }> | null
  }
  return (data as unknown as Row[]).map((p) => {
    const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: false, limit: 0 as number | null }])) as AdminPlan['features']
    for (const f of p.plan_features ?? []) {
      if ((FEATURE_KEYS as readonly string[]).includes(f.feature_key)) features[f.feature_key as FeatureKey] = { enabled: f.is_enabled, limit: f.limit_value }
    }
    const usd = (p.plan_prices ?? []).find((x) => x.currency === 'USD')
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      priceMinor: Number(p.price_minor),
      currency: p.currency,
      intervalMonths: p.interval_months,
      isActive: p.is_active,
      isPublic: p.is_public,
      highlight: p.highlight,
      position: p.position,
      usdPrice: usd ? { amountMinor: Number(usd.amount_minor), isActive: usd.is_active } : null,
      features,
    }
  })
}
