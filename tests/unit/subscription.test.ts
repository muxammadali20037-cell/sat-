import { describe, expect, it } from 'vitest'
import { featureLines, planAction, providersForPlan } from '@/features/subscriptions/plan-view'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'

const plan = (id: string, priceMinor: number, prices: Array<{ currency: string; amountMinor: number }> = []) => ({ id, code: id, priceMinor, currency: 'UZS', prices })

describe('subscription page plan actions', () => {
  it('maps the current subscription to the right action per plan card', () => {
    const current = { planId: 'pro', planPriceMinor: 19_900_000, effective: 'active' as const, scheduledPlanId: null }
    expect(planAction(plan('free', 0), null)).toEqual({ kind: 'current-free' })
    expect(planAction(plan('free', 0), current)).toEqual({ kind: 'free' })
    expect(planAction(plan('starter', 9_900_000), null)).toEqual({ kind: 'pay', purpose: 'new' })
    expect(planAction(plan('pro', 19_900_000), current)).toEqual({ kind: 'pay', purpose: 'renewal' })
    expect(planAction(plan('premium', 39_900_000), current)).toEqual({ kind: 'pay', purpose: 'upgrade' })
    expect(planAction(plan('starter', 9_900_000), current)).toEqual({ kind: 'schedule' })
    const scheduled = { ...current, scheduledPlanId: 'starter' }
    expect(planAction(plan('starter', 9_900_000), scheduled)).toEqual({ kind: 'pay', purpose: 'downgrade' })
    expect(planAction(plan('pro', 19_900_000), scheduled)).toEqual({ kind: 'keep-first' })
    // An expired subscription is treated as none.
    expect(planAction(plan('starter', 9_900_000), { ...current, effective: 'expired' })).toEqual({ kind: 'pay', purpose: 'new' })
  })

  it('offers only providers that can charge the plan currency', () => {
    const providers = [
      { id: 'click' as const, currencies: ['UZS'] as const },
      { id: 'stripe' as const, currencies: ['USD'] as const },
    ]
    expect(providersForPlan(plan('pro', 19_900_000), providers).map((p) => p.id)).toEqual(['click'])
    expect(providersForPlan(plan('pro', 19_900_000, [{ currency: 'USD', amountMinor: 1900 }]), providers).map((p) => p.id)).toEqual(['click', 'stripe'])
  })

  it('renders feature lines from limits (null = unlimited)', () => {
    const lines = featureLines(
      {
        diagnostic: { enabled: true, limit: null },
        video_lessons: { enabled: false, limit: null },
        practice_questions_daily: { enabled: true, limit: 20 },
        ai_requests_daily: { enabled: true, limit: null },
        mock_exams_monthly: { enabled: true, limit: 1 },
        analytics_full: { enabled: false, limit: null },
        study_plan: { enabled: true, limit: null },
      },
      subscriptionDict.en.plans.features,
    )
    expect(lines.map((l) => l.label)).toEqual([
      'Diagnostic test',
      'Preview lessons',
      '20 practice questions a day',
      'Unlimited AI tutor requests',
      '1 mock exam a month',
      'Basic analytics',
      'Personal study plan',
    ])
  })
})
