/**
 * Pure view helpers for the subscription page (no server imports, safe for client components).
 */
import { format } from '@/lib/i18n/dict'
import { computeCheckoutPurpose, pickPrice, type EffectiveStatus } from '@/lib/payments/purpose'
import type { Currency, ProviderId } from '@/lib/payments/types'

export function formatDate(iso: string, locale: string, timeZone?: string): string {
  const intl = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB'
  try {
    return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long', year: 'numeric', ...(timeZone ? { timeZone } : {}) }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export type FeatureMap = Record<string, { enabled: boolean; limit: number | null }>

type FeatureLabels = {
  diagnostic: string
  video_lessons: string
  video_lessons_preview: string
  practice_questions_daily: string
  practice_unlimited: string
  ai_requests_daily: string
  ai_unlimited: string
  mock_exams_monthly: string
  mock_exam_one: string
  mock_unlimited: string
  no_mocks: string
  analytics_full: string
  analytics_basic: string
  study_plan: string
  no_study_plan: string
}

/** Feature bullets for a plan card: [label, included]. */
export function featureLines(f: FeatureMap, t: FeatureLabels): Array<{ label: string; included: boolean }> {
  const lines: Array<{ label: string; included: boolean }> = []
  const on = (k: string) => f[k]?.enabled ?? false
  const lim = (k: string) => f[k]?.limit ?? null
  lines.push({ label: t.diagnostic, included: on('diagnostic') })
  lines.push({ label: on('video_lessons') ? t.video_lessons : t.video_lessons_preview, included: on('video_lessons') })
  if (on('practice_questions_daily')) {
    const n = lim('practice_questions_daily')
    lines.push({ label: n === null ? t.practice_unlimited : format(t.practice_questions_daily, { n }), included: true })
  }
  if (on('ai_requests_daily')) {
    const n = lim('ai_requests_daily')
    lines.push({ label: n === null ? t.ai_unlimited : format(t.ai_requests_daily, { n }), included: true })
  }
  const mocks = lim('mock_exams_monthly')
  if (!on('mock_exams_monthly') || mocks === 0) lines.push({ label: t.no_mocks, included: false })
  else lines.push({ label: mocks === null ? t.mock_unlimited : mocks === 1 ? t.mock_exam_one : format(t.mock_exams_monthly, { n: mocks }), included: true })
  lines.push({ label: on('analytics_full') ? t.analytics_full : t.analytics_basic, included: on('analytics_full') })
  lines.push({ label: on('study_plan') ? t.study_plan : t.no_study_plan, included: on('study_plan') })
  return lines
}

export type PlanForView = {
  id: string
  code: string
  priceMinor: number
  currency: string
  prices: Array<{ currency: string; amountMinor: number }>
}

export type CurrentForView = {
  planId: string
  planPriceMinor: number
  effective: EffectiveStatus
  scheduledPlanId: string | null
} | null

export type PlanAction =
  | { kind: 'current-free' }
  | { kind: 'free' }
  | { kind: 'pay'; purpose: 'new' | 'renewal' | 'upgrade' | 'downgrade' }
  | { kind: 'keep-first' }
  | { kind: 'schedule' }

export function planAction(plan: PlanForView, current: CurrentForView): PlanAction {
  const inEffect = current && (current.effective === 'active' || current.effective === 'grace') ? current : null
  if (plan.priceMinor <= 0) return inEffect ? { kind: 'free' } : { kind: 'current-free' }
  const r = computeCheckoutPurpose(inEffect, { planId: plan.id, priceMinor: plan.priceMinor })
  if (r.ok) return { kind: 'pay', purpose: r.purpose }
  return r.reason === 'scheduled_change_pending' ? { kind: 'keep-first' } : { kind: 'schedule' }
}

/** Providers that can charge this plan (base currency or an alternate price). */
export function providersForPlan<T extends { id: ProviderId; currencies: readonly Currency[] }>(plan: PlanForView, providers: T[]): T[] {
  return providers.filter((p) => pickPrice({ priceMinor: plan.priceMinor, currency: plan.currency, prices: plan.prices }, p.currencies) !== null)
}
