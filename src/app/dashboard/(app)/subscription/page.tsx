import type { Metadata } from 'next'
import { Check, Info, Minus } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'
import { createServerSupabase } from '@/lib/supabase/server'
import { getPublicPlans } from '@/features/plans/server'
import { getSubscriptionOverview } from '@/features/subscriptions/server'
import { featureLines, formatDate, planAction, providersForPlan } from '@/features/subscriptions/plan-view'
import { getMyPayments } from '@/features/payments/server'
import { configuredProviders } from '@/lib/payments/registry'
import { countryRules, providersForCountry } from '@/config/countries'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert, Badge, Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { DataTable } from '@/components/ui/data-table'
import { CheckoutButtons } from '@/components/subscription/checkout-buttons'
import { ScheduleDowngradeButton, SubscriptionActions } from '@/components/subscription/subscription-actions'
import { cn, formatMoney } from '@/lib/utils'
import { isMiniAppRequest } from '@/features/telegram/server'

export const metadata: Metadata = { title: 'Subscription' }

const statusVariant = {
  pending: 'neutral',
  processing: 'warning',
  succeeded: 'success',
  failed: 'destructive',
  canceled: 'neutral',
  refunded: 'outline',
} as const

export default async function SubscriptionPage() {
  const profile = await requireStudentReady({ next: '/dashboard/subscription' })
  const [t, locale, db] = await Promise.all([getDict(subscriptionDict), getLocale(), createServerSupabase()])
  const [overview, plans, payments] = await Promise.all([getSubscriptionOverview(profile), getPublicPlans(db), getMyPayments(db, profile.id)])
  // Payment methods and the shown currency follow the country in Settings (all methods when unset).
  const providers = providersForCountry(profile.countryCode, configuredProviders())
  const usdFirst = countryRules(profile.countryCode)?.currency === 'USD'
  // Inside the Telegram Mini App nothing is sold (Telegram requires Stars for digital goods there).
  const inTelegram = await isMiniAppRequest()
  const sub = overview.subscription
  const tz = profile.timezone
  const date = (iso: string) => formatDate(iso, locale, tz)
  const current = sub
    ? { planId: sub.plan.id, planPriceMinor: sub.plan.priceMinor, effective: sub.effective, scheduledPlanId: sub.scheduledPlan?.id ?? null }
    : null
  const accessUntil = sub ? date(sub.effective === 'grace' ? sub.graceEndsAt : sub.periodEnd) : ''

  const usage = [
    { label: t.usage.practice, ...overview.usage.practiceToday },
    { label: t.usage.ai, ...overview.usage.aiToday },
    { label: t.usage.mocks, ...overview.usage.mocksThisMonth },
  ]

  return (
    <div className="space-y-10">
      <PageHeader title={t.title} description={t.description} />

      {/* Current plan */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">{t.current.heading}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-[24px] font-semibold leading-tight">{sub ? sub.plan.name : overview.plan.name}</h2>
              <Badge variant={overview.status === 'active' ? 'success' : overview.status === 'grace' ? 'warning' : 'neutral'}>
                {t.current.status[overview.status]}
              </Badge>
            </div>
            {sub ? (
              <p className="mt-1.5 text-sm text-muted-foreground">
                {format(t.current.paidUntil, { date: date(sub.periodEnd) })}
                {sub.lastProvider && sub.lastProvider in t.method && (
                  <> · {format(t.current.lastPaidWith, { provider: t.method[sub.lastProvider as keyof typeof t.method] })}</>
                )}
              </p>
            ) : (
              !inTelegram && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{t.current.freeBody}</p>
            )}
          </div>
          {sub && (
            <SubscriptionActions
              currentPlanName={sub.plan.name}
              cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
              accessUntil={accessUntil}
              scheduledPlanName={sub.scheduledPlan?.name ?? null}
            />
          )}
        </div>

        {sub && (sub.effective === 'grace' || sub.cancelAtPeriodEnd || sub.scheduledPlan) && (
          <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:px-6">
            {sub.effective === 'grace' && (
              <Alert variant="warning" title={t.current.status.grace}>
                {format(t.current.graceBody, { end: date(sub.periodEnd), graceEnd: date(sub.graceEndsAt) })}
              </Alert>
            )}
            {sub.cancelAtPeriodEnd && <Alert variant="neutral">{format(t.current.canceledBody, { date: accessUntil })}</Alert>}
            {sub.scheduledPlan && <Alert variant="primary">{format(t.current.scheduledBody, { plan: sub.scheduledPlan.name })}</Alert>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 border-t border-border p-5 sm:grid-cols-3 sm:p-6">
          {usage.map((u) => (
            <div key={u.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{u.label}</span>
                <span className="font-medium tabular">
                  {!u.enabled || u.limit === 0
                    ? t.usage.notIncluded
                    : u.limit === null
                      ? format(t.usage.usedUnlimited, { used: u.used })
                      : format(t.usage.of, { used: u.used, limit: u.limit })}
                </span>
              </div>
              {u.enabled && u.limit !== null && u.limit > 0 ? (
                <ProgressBar
                  className="mt-2"
                  size="sm"
                  label={u.label}
                  value={Math.min(u.used, u.limit)}
                  max={u.limit}
                  tone={u.used >= u.limit ? 'warning' : 'primary'}
                />
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{u.enabled && u.limit === null ? t.usage.unlimited : '—'}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Plans */}
      {inTelegram ? (
        <Alert variant="neutral" title={t.miniApp.heading}>
          {t.miniApp.body}
        </Alert>
      ) : (
      <Section title={t.plans.heading} description={t.plans.description}>
        {providers.length === 0 && <Alert variant="warning">{t.plans.noProviders}</Alert>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const action = planAction(plan, current)
            const isCurrent = sub ? sub.plan.id === plan.id : plan.priceMinor === 0
            const planProviders = providersForPlan(plan, providers).map((p) => p.id)
            const usd = plan.prices.find((p) => p.currency === 'USD')
            return (
              <Card key={plan.id} className={cn('flex flex-col', plan.highlight && 'border-primary', isCurrent && 'bg-primary-soft/40')}>
                <div className="p-5 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{plan.name}</h3>
                    {isCurrent ? (
                      <Badge variant="primary">{t.plans.currentPlan}</Badge>
                    ) : plan.highlight ? (
                      <Badge variant="outline">{t.plans.highlight}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-[26px] font-semibold leading-none tabular">
                    {usdFirst && usd && plan.priceMinor > 0 ? formatMoney(usd.amountMinor, 'USD', locale) : formatMoney(plan.priceMinor, plan.currency, locale)}
                    {plan.priceMinor > 0 && <span className="ml-1 text-sm font-normal text-muted-foreground">{t.plans.perMonth}</span>}
                  </p>
                  {usd && plan.priceMinor > 0 && !usdFirst && (
                    <p className="mt-1.5 text-[13px] text-muted-foreground tabular">
                      {format(t.plans.orUsd, { price: formatMoney(usd.amountMinor, 'USD', locale) })}
                    </p>
                  )}
                  <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <ul className="grid grid-cols-1 gap-2 border-t border-border px-5 py-4 text-sm">
                  {featureLines(plan.features, t.plans.features).map((line) => (
                    <li key={line.label} className={cn('flex items-start gap-2', !line.included && 'text-muted-foreground')}>
                      {line.included ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Included" />
                      ) : (
                        <Minus className="mt-0.5 size-4 shrink-0" aria-label="Not included" />
                      )}
                      {line.label}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto grid grid-cols-1 gap-3 border-t border-border p-5">
                  {action.kind === 'current-free' && <p className="text-sm text-muted-foreground">{t.plans.freeIncluded}</p>}
                  {action.kind === 'free' && <p className="text-sm text-muted-foreground">{t.plans.freeAfterPaid}</p>}
                  {action.kind === 'keep-first' && (
                    <p className="text-sm text-muted-foreground">{format(t.plans.keepFirstNote, { plan: sub?.scheduledPlan?.name ?? '' })}</p>
                  )}
                  {action.kind === 'schedule' && sub && (
                    <>
                      <p className="text-sm text-muted-foreground">{t.plans.downgradeNote}</p>
                      <ScheduleDowngradeButton planCode={plan.code} planName={plan.name} currentPlanName={sub.plan.name} accessUntil={date(sub.periodEnd)} />
                    </>
                  )}
                  {action.kind === 'pay' && (
                    <>
                      {action.purpose === 'upgrade' && <p className="text-sm text-muted-foreground">{format(t.plans.upgradeNote, { plan: plan.name })}</p>}
                      {action.purpose === 'downgrade' && <p className="text-sm text-muted-foreground">{format(t.plans.scheduledNote, { plan: plan.name })}</p>}
                      {planProviders.length > 0 ? (
                        <CheckoutButtons planCode={plan.code} providers={planProviders} primary={plan.highlight || isCurrent} />
                      ) : providers.length > 0 ? (
                        <p className="text-sm text-muted-foreground">{t.plans.noProviderForPlan}</p>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t.plans.noAutoCharge}
        </p>
      </Section>
      )}

      {/* Payment history */}
      <Section title={t.history.heading}>
        <DataTable
          rows={payments}
          rowKey={(p) => p.id}
          caption={t.history.heading}
          empty={{ title: t.history.empty, description: t.history.emptyBody }}
          columns={[
            { key: 'number', header: t.history.number, cell: (p) => <span className="tabular">#{p.number}</span> },
            { key: 'date', header: t.history.date, cell: (p) => date(p.createdAt) },
            { key: 'plan', header: t.history.plan, cell: (p) => p.planName, hideBelow: 'sm' },
            { key: 'amount', header: t.history.amount, align: 'right', cell: (p) => formatMoney(p.amountMinor, p.currency, locale) },
            {
              key: 'method',
              header: t.history.method,
              hideBelow: 'md',
              cell: (p) => (p.provider in t.method ? t.method[p.provider as keyof typeof t.method] : p.provider),
            },
            {
              key: 'status',
              header: t.history.status,
              cell: (p) => (
                <Badge variant={statusVariant[p.status as keyof typeof statusVariant] ?? 'neutral'}>
                  {t.status[p.status as keyof typeof t.status] ?? p.status}
                </Badge>
              ),
            },
          ]}
        />
      </Section>
    </div>
  )
}
