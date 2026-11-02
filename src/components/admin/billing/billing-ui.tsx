import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Server-renderable admin billing pieces (no client state). */

export function BillingTabs({ active }: { active: 'subscriptions' | 'plans' }) {
  const tabs = [
    { key: 'subscriptions', href: '/admin/subscriptions', label: 'Subscriptions' },
    { key: 'plans', href: '/admin/subscriptions/plans', label: 'Plans' },
  ] as const
  return (
    <nav aria-label="Billing sections" className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors',
            active === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

const PAYMENT_VARIANT = {
  pending: 'neutral',
  processing: 'warning',
  succeeded: 'success',
  failed: 'destructive',
  canceled: 'neutral',
  refunded: 'outline',
} as const

export function PaymentStatusBadge({ status }: { status: string }) {
  return <Badge variant={PAYMENT_VARIANT[status as keyof typeof PAYMENT_VARIANT] ?? 'neutral'}>{status === 'succeeded' ? 'paid' : status}</Badge>
}

const SUB_VARIANT = { active: 'success', grace: 'warning', expired: 'neutral', canceled: 'destructive' } as const

export function SubscriptionStateBadge({ effective, cancelAtPeriodEnd }: { effective: string; cancelAtPeriodEnd?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={SUB_VARIANT[effective as keyof typeof SUB_VARIANT] ?? 'neutral'}>{effective}</Badge>
      {cancelAtPeriodEnd && effective !== 'canceled' && effective !== 'expired' && <Badge variant="outline">not renewing</Badge>}
    </span>
  )
}

export const PROVIDER_LABELS: Record<string, string> = {
  click: 'Click',
  payme: 'Payme',
  stripe: 'Stripe',
  test: 'Test',
  manual: 'Manual',
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tashkent' }).format(new Date(iso))
}

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Tashkent' }).format(new Date(iso))
}

/** Collapsible raw JSON viewer for provider payloads (escaped by React; never rendered as HTML). */
export function PayloadViewer({ payload, label = 'Raw payload' }: { payload: unknown; label?: string }) {
  return (
    <details className="group mt-2">
      <summary className="cursor-pointer select-none text-[13px] text-primary hover:underline">{label}</summary>
      <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  )
}

export function DefinitionList({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[13px] text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  )
}
