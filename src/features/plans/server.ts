import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { FEATURE_KEYS, type FeatureKey } from '@/features/entitlements/server'

export type PublicPlan = {
  id: string
  code: string
  name: string
  description: string
  priceMinor: number
  currency: string
  intervalMonths: number
  highlight: boolean
  prices: Array<{ currency: string; amountMinor: number }>
  features: Record<FeatureKey, { enabled: boolean; limit: number | null }>
}

/** Active public plans with features and alternate-currency prices (readable by anon via RLS). */
export async function getPublicPlans(db: Db): Promise<PublicPlan[]> {
  const { data, error } = await db
    .from('plans')
    .select('id, code, name, description, price_minor, currency, interval_months, highlight, position, plan_features(feature_key, is_enabled, limit_value), plan_prices(currency, amount_minor, is_active)')
    .eq('is_active', true)
    .eq('is_public', true)
    .order('position')
  if (error) throw error
  return data.map((p) => {
    const features = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: false, limit: 0 as number | null }])) as PublicPlan['features']
    for (const f of p.plan_features ?? []) {
      if ((FEATURE_KEYS as readonly string[]).includes(f.feature_key)) {
        features[f.feature_key as FeatureKey] = { enabled: f.is_enabled, limit: f.limit_value }
      }
    }
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      priceMinor: p.price_minor,
      currency: p.currency,
      intervalMonths: p.interval_months,
      highlight: p.highlight,
      prices: (p.plan_prices ?? []).filter((x) => x.is_active).map((x) => ({ currency: x.currency, amountMinor: x.amount_minor })),
      features,
    }
  })
}
