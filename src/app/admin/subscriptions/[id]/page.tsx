import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { getSubscriptionForAdmin, listPlansForAdmin, listSubscriptionsForUser } from '@/features/subscriptions/admin'
import { listPaymentsForUser } from '@/features/payments/admin'
import {
  DefinitionList,
  formatDateTime,
  formatDay,
  PaymentStatusBadge,
  PROVIDER_LABELS,
  SubscriptionStateBadge,
} from '@/components/admin/billing/billing-ui'
import { GrantAccessDialog, OfflinePaymentDialog } from '@/components/admin/billing/billing-dialogs'
import { formatMoney } from '@/lib/utils'

export const metadata: Metadata = { title: 'Subscription' }

export default async function AdminSubscriptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(ADMIN_ROLES)
  const { id } = await params
  const sub = await getSubscriptionForAdmin(id)
  if (!sub) notFound()
  const [payments, history, plans] = await Promise.all([listPaymentsForUser(sub.userId), listSubscriptionsForUser(sub.userId), listPlansForAdmin()])
  const planOptions = plans.map((p) => ({ code: p.code, name: p.name, priceMinor: p.priceMinor, currency: p.currency, usdMinor: p.usdPrice?.isActive ? p.usdPrice.amountMinor : null }))

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Subscriptions', href: '/admin/subscriptions' }, { label: sub.email }]} />}
        title={sub.email}
        description={sub.fullName || undefined}
        actions={
          <>
            <OfflinePaymentDialog plans={planOptions} defaultEmail={sub.email} />
            <GrantAccessDialog plans={planOptions} defaultEmail={sub.email} defaultPlan={sub.planCode} />
          </>
        }
      />
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{sub.planName}</h2>
          <SubscriptionStateBadge effective={sub.effective} cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
        </div>
        <DefinitionList
          items={[
            ['Stored status', sub.status],
            ['Period start', formatDateTime(sub.periodStart)],
            ['Period end', formatDateTime(sub.periodEnd)],
            ['Renewal', sub.cancelAtPeriodEnd ? `Canceled by student ${formatDay(sub.canceledAt)}` : 'Reminders on'],
            ['Scheduled plan', sub.scheduledPlanName ?? '—'],
            ['Last paid via', sub.lastProvider ? (PROVIDER_LABELS[sub.lastProvider] ?? sub.lastProvider) : '—'],
            ['Created', formatDateTime(sub.createdAt)],
            ['Updated', formatDateTime(sub.updatedAt)],
            ['Subscription id', <span key="id" className="font-mono text-xs">{sub.id}</span>],
          ]}
        />
      </Card>

      <Section title="Payments" description="All payments by this student, newest first.">
        <DataTable
          rows={payments}
          rowKey={(p) => p.id}
          caption="Payments"
          empty={{ title: 'No payments', description: 'This student has not paid yet (access may have been granted manually).' }}
          columns={[
            { key: 'n', header: 'Number', cell: (p) => <Link className="text-primary hover:underline tabular" href={`/admin/payments/${p.id}`}>#{p.number}</Link> },
            { key: 'date', header: 'Created', cell: (p) => formatDateTime(p.createdAt) },
            { key: 'plan', header: 'Plan', cell: (p) => p.planName },
            { key: 'purpose', header: 'Purpose', hideBelow: 'md', cell: (p) => p.purpose },
            { key: 'amount', header: 'Amount', align: 'right', cell: (p) => formatMoney(p.amountMinor, p.currency) },
            { key: 'provider', header: 'Provider', hideBelow: 'sm', cell: (p) => PROVIDER_LABELS[p.provider] ?? p.provider },
            { key: 'status', header: 'Status', cell: (p) => <PaymentStatusBadge status={p.status} /> },
          ]}
        />
      </Section>

      <Section title="Subscription history">
        <DataTable
          rows={history}
          rowKey={(h) => h.id}
          caption="Subscription history"
          columns={[
            { key: 'plan', header: 'Plan', cell: (h) => (h.id === sub.id ? <span className="font-medium">{h.planName} (this)</span> : <Link className="text-primary hover:underline" href={`/admin/subscriptions/${h.id}`}>{h.planName}</Link>) },
            { key: 'state', header: 'Status', cell: (h) => <SubscriptionStateBadge effective={h.effective} /> },
            { key: 'start', header: 'Start', cell: (h) => formatDay(h.periodStart) },
            { key: 'end', header: 'End', cell: (h) => formatDay(h.periodEnd) },
          ]}
        />
      </Section>
    </div>
  )
}
