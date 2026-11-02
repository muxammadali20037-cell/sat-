/**
 * Pure billing rules shared by checkout, the subscription page and tests.
 * Mirrors public.subscription_effective_status() and the plan-change rules of
 * docs/PRODUCT_SPEC.md §4.11: upgrade = immediate (pro-rata credit), downgrade = scheduled,
 * renewal = same plan (or the scheduled plan).
 */
import type { Currency } from './types'

export type EffectiveStatus = 'active' | 'grace' | 'expired' | 'canceled'

/** Same rule as SQL public.subscription_effective_status(status, period_end). */
export function effectiveStatus(status: string, periodEnd: string | Date, graceDays: number, now = new Date()): EffectiveStatus {
  if (status === 'canceled' || status === 'expired') return status
  const end = typeof periodEnd === 'string' ? new Date(periodEnd) : periodEnd
  if (now.getTime() < end.getTime()) return 'active'
  if (now.getTime() < end.getTime() + graceDays * 86_400_000) return 'grace'
  return 'expired'
}

export type CurrentSubscription = {
  planId: string
  /** Base (UZS) price of the current plan, used to rank plans. */
  planPriceMinor: number
  effective: EffectiveStatus
  scheduledPlanId: string | null
}

export type PurposeResult =
  | { ok: true; purpose: 'new' | 'renewal' | 'upgrade' | 'downgrade' }
  | { ok: false; reason: 'downgrade_must_be_scheduled' | 'scheduled_change_pending' }

/**
 * Purpose of a checkout for `target` given the user's current subscription.
 * - no subscription in effect (none / expired / canceled) → new
 * - target = scheduled plan (a downgrade the student scheduled) → downgrade (this is what a renewal buys)
 * - target = current plan → renewal, unless a different plan is scheduled (keep the plan first)
 * - target priced higher or equal → upgrade (immediate; unused days convert pro-rata in SQL)
 * - target priced lower → refused: downgrades are scheduled for the next renewal, not paid now
 */
export function computeCheckoutPurpose(current: CurrentSubscription | null, target: { planId: string; priceMinor: number }): PurposeResult {
  if (!current || (current.effective !== 'active' && current.effective !== 'grace')) return { ok: true, purpose: 'new' }
  if (current.scheduledPlanId && current.scheduledPlanId === target.planId && target.planId !== current.planId) {
    return { ok: true, purpose: 'downgrade' }
  }
  if (target.planId === current.planId) {
    if (current.scheduledPlanId && current.scheduledPlanId !== current.planId) return { ok: false, reason: 'scheduled_change_pending' }
    return { ok: true, purpose: 'renewal' }
  }
  if (target.priceMinor >= current.planPriceMinor) return { ok: true, purpose: 'upgrade' }
  return { ok: false, reason: 'downgrade_must_be_scheduled' }
}

export type PlanPricing = {
  priceMinor: number
  currency: string
  prices: Array<{ currency: string; amountMinor: number; isActive?: boolean }>
}

/**
 * Amount to charge for a plan with a provider: the base price when the provider accepts the
 * plan currency, otherwise the first active alternate price (plan_prices) in an accepted currency.
 */
export function pickPrice(plan: PlanPricing, accepted: readonly Currency[]): { amountMinor: number; currency: Currency } | null {
  if ((accepted as readonly string[]).includes(plan.currency) && plan.priceMinor > 0) {
    return { amountMinor: plan.priceMinor, currency: plan.currency as Currency }
  }
  for (const c of accepted) {
    const price = plan.prices.find((p) => p.currency === c && p.isActive !== false && p.amountMinor > 0)
    if (price) return { amountMinor: price.amountMinor, currency: c }
  }
  return null
}

/**
 * Parses a decimal major-unit amount ("99000", "99000.0", "99000.00") into minor units without
 * floating point. Returns null for anything else (negative, exponent, > 2 decimals).
 */
export function majorToMinor(value: string): number | null {
  const m = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!m) return null
  const whole = Number(m[1])
  const frac = Number((m[2] ?? '').padEnd(2, '0'))
  const minor = whole * 100 + frac
  return Number.isSafeInteger(minor) ? minor : null
}

/** 9900000 → "99000.00" (Click "N.NN" format). */
export function minorToMajorString(amountMinor: number): string {
  const whole = Math.floor(amountMinor / 100)
  const frac = String(amountMinor % 100).padStart(2, '0')
  return `${whole}.${frac}`
}
