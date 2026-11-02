import type { Metadata } from 'next'
import Link from 'next/link'
import { requireRole } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader, Section } from '@/components/layout/page-header'
import { DataTable, Pagination } from '@/components/ui/data-table'
import { Badge } from '@/components/ui/card'
import { ADMIN_PAGE_SIZE, listPaymentsForAdmin, listUnmatchedEvents } from '@/features/payments/admin'
import { listPlansForAdmin } from '@/features/subscriptions/admin'
import { formatDateTime, PaymentStatusBadge, PayloadViewer, PROVIDER_LABELS } from '@/components/admin/billing/billing-ui'
import { FilterForm } from '@/components/admin/billing/filter-form'
import { OfflinePaymentDialog } from '@/components/admin/billing/billing-dialogs'
import { configuredProviders } from '@/lib/payments/registry'
import { formatMoney } from '@/lib/utils'

export const metadata: Metadata = { title: 'Payments' }

type Search = { status?: string; provider?: string; from?: string; to?: string; q?: string; page?: string }

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole(ADMIN_ROLES, { next: '/admin/payments' })
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const [{ rows, total }, unmatched, plans] = await Promise.all([
    listPaymentsForAdmin({ status: sp.status, provider: sp.provider, from: sp.from, to: sp.to, q: sp.q, page }),
    listUnmatchedEvents(10),
    listPlansForAdmin(),
  ])
  const configured = configuredProviders().map((p) => p.label)
  const planOptions = plans.map((p) => ({ code: p.code, name: p.name, priceMinor: p.priceMinor, currency: p.currency, usdMinor: p.usdPrice?.isActive ? p.usdPrice.amountMinor : null }))
  const href = (n: number) => {
    const q = new URLSearchParams(Object.entries({ ...sp, page: String(n) }).filter(([, v]) => v) as [string, string][])
    return `/admin/payments?${q.toString()}`
  }

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Payments"
          description={`Every checkout and its provider callbacks. Configured providers: ${configured.length ? configured.join(', ') : 'none'}.`}
          actions={<OfflinePaymentDialog plans={planOptions} />}
        />
        <FilterForm
          action="/admin/payments"
          fields={[
            { kind: 'search', name: 'q', label: 'Search', placeholder: 'Payment number or student email', value: sp.q },
            {
              kind: 'select',
              name: 'status',
              label: 'Status',
              value: sp.status,
              options: [{ value: '', label: 'Any status' }, ...['pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded'].map((s) => ({ value: s, label: s === 'succeeded' ? 'paid' : s }))],
            },
            {
              kind: 'select',
              name: 'provider',
              label: 'Provider',
              value: sp.provider,
              options: [{ value: '', label: 'Any provider' }, ...Object.entries(PROVIDER_LABELS).map(([value, label]) => ({ value, label }))],
            },
            { kind: 'date', name: 'from', label: 'From', value: sp.from },
            { kind: 'date', name: 'to', label: 'To', value: sp.to },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          caption="Payments"
          empty={{ title: 'No payments match', description: 'Change the filters, or wait for the first checkout.' }}
          columns={[
            { key: 'n', header: 'Number', cell: (r) => <Link href={`/admin/payments/${r.id}`} className="font-medium text-primary tabular hover:underline">#{r.number}</Link> },
            { key: 'created', header: 'Created', cell: (r) => formatDateTime(r.createdAt) },
            { key: 'student', header: 'Student', cell: (r) => r.email },
            { key: 'plan', header: 'Plan', hideBelow: 'md', cell: (r) => `${r.planName} · ${r.purpose}` },
            { key: 'amount', header: 'Amount', align: 'right', cell: (r) => formatMoney(r.amountMinor, r.currency) },
            { key: 'provider', header: 'Provider', hideBelow: 'sm', cell: (r) => PROVIDER_LABELS[r.provider] ?? r.provider },
            { key: 'status', header: 'Status', cell: (r) => <PaymentStatusBadge status={r.status} /> },
          ]}
        />
        <Pagination page={page} pageSize={ADMIN_PAGE_SIZE} total={total} hrefForPage={href} />
      </div>

      <Section title="Unmatched callbacks" description="Recent provider requests that failed verification or did not match a payment. Useful when configuring a provider.">
        <DataTable
          rows={unmatched}
          rowKey={(e) => e.id}
          caption="Unmatched callbacks"
          empty={{ title: 'Nothing unmatched', description: 'Every recent callback matched a payment.' }}
          columns={[
            { key: 'at', header: 'Received', cell: (e) => formatDateTime(e.createdAt) },
            { key: 'provider', header: 'Provider', cell: (e) => PROVIDER_LABELS[e.provider] ?? e.provider },
            { key: 'type', header: 'Event', cell: (e) => <span className="font-mono text-xs">{e.eventType}</span> },
            { key: 'sig', header: 'Verified', cell: (e) => (e.signatureValid ? <Badge variant="success">yes</Badge> : <Badge variant="destructive">no</Badge>) },
            { key: 'payload', header: 'Payload', cell: (e) => <PayloadViewer payload={e.payload} label="View" /> },
          ]}
        />
      </Section>
    </div>
  )
}
