import Link from 'next/link'
import { Check, Minus } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { format } from '@/lib/i18n/dict'
import type { Locale } from '@/lib/i18n/config'
import type { PublicDict } from '@/lib/i18n/dictionaries/public'
import type { PublicPlan } from '@/features/plans/server'

type PricingT = PublicDict['pricing']
type FeatureKey = keyof PublicPlan['features']

const FEATURE_ORDER: FeatureKey[] = [
  'diagnostic',
  'video_lessons',
  'practice_questions_daily',
  'ai_requests_daily',
  'mock_exams_monthly',
  'analytics_full',
  'study_plan',
]

/** Human value for one plan feature; `included: false` renders a dash instead of a tick. */
export function featureValue(key: FeatureKey, feature: { enabled: boolean; limit: number | null }, t: PricingT): { included: boolean; text: string } {
  const v = t.values
  switch (key) {
    case 'practice_questions_daily':
    case 'ai_requests_daily':
      if (!feature.enabled || feature.limit === 0) return { included: false, text: v.notIncluded }
      return { included: true, text: feature.limit === null ? v.unlimitedPerDay : format(v.perDay, { n: feature.limit }) }
    case 'mock_exams_monthly':
      if (!feature.enabled || feature.limit === 0) return { included: false, text: v.notIncluded }
      return { included: true, text: feature.limit === null ? v.unlimitedPerMonth : format(v.perMonth, { n: feature.limit }) }
    case 'video_lessons':
      return feature.enabled ? { included: true, text: v.included } : { included: true, text: v.previewLessons }
    case 'analytics_full':
      return feature.enabled ? { included: true, text: v.full } : { included: true, text: v.basic }
    default:
      return feature.enabled ? { included: true, text: v.included } : { included: false, text: v.notIncluded }
  }
}

function planCta(plan: PublicPlan) {
  return plan.priceMinor === 0 ? '/register' : `/register?next=${encodeURIComponent('/dashboard/subscription')}`
}

function planDescription(plan: PublicPlan, t: PricingT, locale: Locale) {
  return locale === 'en' ? plan.description : (t.planDescriptions[plan.code] ?? plan.description)
}

function Price({ plan, t, locale }: { plan: PublicPlan; t: PricingT; locale: Locale }) {
  if (plan.priceMinor === 0) {
    return <p className="font-display text-[30px] font-semibold leading-none text-foreground">{t.free}</p>
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-display text-[30px] font-semibold leading-none text-foreground tabular">
        {formatMoney(plan.priceMinor, plan.currency, locale)}
      </span>
      <span className="text-sm text-muted-foreground">{t.perMonth}</span>
    </p>
  )
}

export function PlanCards({ plans, t, locale }: { plans: PublicPlan[]; t: PricingT; locale: Locale }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {plans.map((plan) => (
        <article
          key={plan.id}
          aria-labelledby={`plan-${plan.code}`}
          className={cn('flex flex-col rounded-xl border bg-card p-6', plan.highlight ? 'border-primary ring-1 ring-primary' : 'border-border')}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id={`plan-${plan.code}`} className="text-lg font-semibold text-foreground">
              {plan.name}
            </h3>
            {plan.highlight && <Badge variant="primary">{t.popular}</Badge>}
          </div>
          <p className="mt-2 min-h-10 text-sm text-muted-foreground">{planDescription(plan, t, locale)}</p>
          <div className="mt-5">
            <Price plan={plan} t={t} locale={locale} />
          </div>
          <Button asChild variant={plan.highlight ? 'primary' : 'secondary'} className="mt-6 h-auto min-h-10 w-full whitespace-normal py-2 text-center">
            <Link href={planCta(plan)}>{plan.priceMinor === 0 ? t.startFree : format(t.choose, { plan: plan.name })}</Link>
          </Button>
          <ul className="mt-6 grid grid-cols-1 gap-2.5 border-t border-border pt-5 text-sm">
            {FEATURE_ORDER.map((key) => {
              const value = featureValue(key, plan.features[key], t)
              return (
                <li key={key} className="flex items-start gap-2.5">
                  {value.included ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className={cn(!value.included && 'text-muted-foreground')}>
                    <span className="text-foreground">{t.featureLabels[key]}</span>
                    {': '}
                    <span className={cn(value.included ? 'text-foreground' : 'text-muted-foreground')}>{value.text}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </article>
      ))}
    </div>
  )
}

export function FeatureTable({ plans, t, locale }: { plans: PublicPlan[]; t: PricingT; locale: Locale }) {
  return (
    <div className="overflow-x-auto relative rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">{t.tableTitle}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
              {t.tableFeature}
            </th>
            {plans.map((plan) => (
              <th key={plan.id} scope="col" className="px-4 py-3 text-left">
                <span className="block font-semibold text-foreground">{plan.name}</span>
                <span className="block text-xs font-normal text-muted-foreground tabular">
                  {plan.priceMinor === 0 ? t.free : `${formatMoney(plan.priceMinor, plan.currency, locale)} ${t.perMonth}`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_ORDER.map((key) => (
            <tr key={key} className="border-b border-border last:border-0">
              <th scope="row" className="px-4 py-3 text-left font-medium text-foreground">
                {t.featureLabels[key]}
              </th>
              {plans.map((plan) => {
                const value = featureValue(key, plan.features[key], t)
                return (
                  <td key={plan.id} className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1.5', !value.included && 'text-muted-foreground')}>
                      {value.included ? <Check className="size-4 text-success" aria-hidden /> : <Minus className="size-4" aria-hidden />}
                      {value.text}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
