import type { Metadata } from 'next'
import Link from 'next/link'
import { requireRole } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, Pagination } from '@/components/ui/data-table'
import { listPlansForAdmin, listSubscriptionsForAdmin } from '@/features/subscriptions/admin'
import { ADMIN_PAGE_SIZE } from '@/features/payments/admin'
import { BillingTabs, formatDay, PROVIDER_LABELS, SubscriptionStateBadge } from '@/components/admin/billing/billing-ui'
import { FilterForm } from '@/components/admin/billing/filter-form'
import { GrantAccessDialog, OfflinePaymentDialog } from '@/components/admin/billing/billing-dialogs'

export const metadata: Metadata = { title: 'Subscriptions' }

type Search = { state?: string; plan?: string; q?: string; page?: string }

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(ADMIN_ROLES, { next: '/admin/subscriptions' })
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const [{ rows, total }, plans] = await Promise.all([
    listSubscriptionsForAdmin({ state: sp.state, plan: sp.plan, q: sp.q, page }),
    listPlansForAdmin(),
  ])
  const planOptions = plans.map((p) => ({ code: p.code, name: p.name, priceMinor: p.priceMinor, currency: p.currency, usdMinor: p.usdPrice?.isActive ? p.usdPrice.amountMinor : null }))
  const href = (n: number) => {
    const q = new URLSearchParams(Object.entries({ ...sp, page: String(n) }).filter(([, v]) => v) as [string, string][])
    return `/admin/subscriptions?${q.toString()}`
  }

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Every subscription period, with its effective status (active, grace, expired, canceled)."
        actions={
          <>
            <OfflinePaymentDialog plans={planOptions} />
            <GrantAccessDialog plans={planOptions} />
          </>
        }
      />
      <BillingTabs active="subscriptions" />
      <FilterForm
        action="/admin/subscriptions"
        fields={[
          { kind: 'search', name: 'q', label: 'Search', placeholder: 'Student email', value: sp.q },
          {
            kind: 'select',
            name: 'state',
            label: 'Status',
            value: sp.state,
            options: [
              { value: '', label: 'Any status' },
              { value: 'active', label: 'Active' },
              { value: 'grace', label: 'Grace period' },
              { value: 'canceling', label: 'Not renewing' },
              { value: 'expired', label: 'Expired' },
              { value: 'canceled', label: 'Canceled (refund)' },
            ],
          },
          { kind: 'select', name: 'plan', label: 'Plan', value: sp.plan, options: [{ value: '', label: 'Any plan' }, ...plans.map((p) => ({ value: p.code, label: p.name }))] },
        ]}
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        caption="Subscriptions"
        empty={{ title: 'No subscriptions match', description: 'Subscriptions appear after a verified payment, an offline payment or a manual grant.' }}
        columns={[
          {
            key: 'student',
            header: 'Student',
            cell: (r) => (
              <Link href={`/admin/subscriptions/${r.id}`} className="font-medium text-primary hover:underline">
                {r.email}
                {r.fullName && <span className="block text-xs font-normal text-muted-foreground">{r.fullName}</span>}
              </Link>
            ),
          },
          { key: 'plan', header: 'Plan', cell: (r) => r.planName },
          { key: 'state', header: 'Status', cell: (r) => <SubscriptionStateBadge effective={r.effective} cancelAtPeriodEnd={r.cancelAtPeriodEnd} /> },
          { key: 'end', header: 'Period end', cell: (r) => formatDay(r.periodEnd) },
          { key: 'scheduled', header: 'Scheduled', hideBelow: 'lg', cell: (r) => r.scheduledPlanName ?? '—' },
          { key: 'provider', header: 'Last paid via', hideBelow: 'md', cell: (r) => (r.lastProvider ? (PROVIDER_LABELS[r.lastProvider] ?? r.lastProvider) : '—') },
        ]}
      />
      <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} total={total} hrefForPage={href} />
    </div>
  )
}
