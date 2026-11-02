import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Alert, Badge, Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { getPaymentForAdmin } from '@/features/payments/admin'
import { DefinitionList, formatDateTime, PaymentStatusBadge, PayloadViewer, PROVIDER_LABELS } from '@/components/admin/billing/billing-ui'
import { RefundDialog } from '@/components/admin/billing/billing-dialogs'
import { formatMoney } from '@/lib/utils'

export const metadata: Metadata = { title: 'Payment' }

const PAYME_STATES: Record<number, string> = { 1: '1 · created', 2: '2 · performed', [-1]: '-1 · canceled', [-2]: '-2 · canceled after perform' }
const ms = (v: number | null) => (v ? formatDateTime(new Date(v).toISOString()) : '—')

export default async function AdminPaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(ADMIN_ROLES)
  const { id } = await params
  const p = await getPaymentForAdmin(id)
  if (!p) notFound()
  const providerLabel = PROVIDER_LABELS[p.provider] ?? p.provider

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Payments', href: '/admin/payments' }, { label: `#${p.number}` }]} />}
        title={`Payment #${p.number}`}
        description={`${formatMoney(p.amountMinor, p.currency)} · ${p.planName} · ${providerLabel}`}
        actions={
          p.status === 'succeeded' ? (
            <RefundDialog paymentId={p.id} number={p.number} amountMinor={p.amountMinor} currency={p.currency} providerLabel={providerLabel} />
          ) : undefined
        }
      />

      {p.status === 'refunded' && (
        <Alert variant="neutral" title="Refund recorded">
          {formatMoney(p.refundAmountMinor ?? 0, p.currency)} on {formatDateTime(p.refundedAt)} — {p.refundReason || 'no reason given'}. Money is returned in the
          provider cabinet; this record does not move money.
        </Alert>
      )}

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <PaymentStatusBadge status={p.status} />
          <Badge variant="outline">{p.purpose}</Badge>
        </div>
        <DefinitionList
          items={[
            ['Student', <Link key="s" className="text-primary hover:underline" href={`/admin/subscriptions?q=${encodeURIComponent(p.email)}`}>{p.email}</Link>],
            ['Plan', `${p.planName} · ${p.periodMonths} month(s)`],
            ['Amount', formatMoney(p.amountMinor, p.currency)],
            ['Created', formatDateTime(p.createdAt)],
            ['Paid', formatDateTime(p.paidAt)],
            ['Updated', formatDateTime(p.updatedAt)],
            ['Provider', providerLabel],
            ['Provider transaction', p.providerTransactionId ? <span key="tx" className="font-mono text-xs">{p.providerTransactionId}</span> : '—'],
            ['Subscription', p.subscriptionId ? <Link key="sub" className="text-primary hover:underline" href={`/admin/subscriptions/${p.subscriptionId}`}>Open</Link> : '—'],
            ...(p.provider === 'payme'
              ? ([
                  ['Payme state', p.providerState !== null ? (PAYME_STATES[p.providerState] ?? String(p.providerState)) : '—'],
                  ['Payme create time', ms(p.providerCreateTimeMs)],
                  ['Payme perform time', ms(p.providerPerformTimeMs)],
                  ['Payme cancel', p.providerCancelTimeMs ? `${ms(p.providerCancelTimeMs)} (reason ${p.providerCancelReason})` : '—'],
                ] as Array<[string, React.ReactNode]>)
              : []),
            ['Failure / cancel reason', p.failedReason ?? '—'],
            ['Idempotency key', <span key="k" className="font-mono text-xs">{p.idempotencyKey}</span>],
          ]}
        />
      </Card>

      <Section title="Provider events" description="Every callback received for this payment, oldest first, with the raw payload as received.">
        {p.events.length === 0 ? (
          <EmptyState title="No callbacks yet" description="The provider has not called back for this payment. A pending payment older than 24 hours is canceled by the daily job." />
        ) : (
          <ol className="relative grid grid-cols-1 gap-3 border-l border-border pl-5">
            {p.events.map((e) => (
              <li key={e.id} className="relative rounded-lg border border-border bg-card p-4">
                <span className="absolute -left-[27px] top-5 flex size-3 rounded-full border-2 border-background bg-border-strong" aria-hidden />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-[13px] font-medium">{e.eventType}</span>
                  {e.signatureValid ? (
                    <Badge variant="success"><CheckCircle2 aria-hidden /> verified</Badge>
                  ) : (
                    <Badge variant="destructive"><ShieldAlert aria-hidden /> not verified</Badge>
                  )}
                  {e.processingError ? (
                    <Badge variant="warning"><XCircle aria-hidden /> {e.processingError.slice(0, 80)}</Badge>
                  ) : e.processedAt ? (
                    <Badge variant="neutral">processed</Badge>
                  ) : (
                    <Badge variant="outline">not processed</Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{e.provider} · {e.providerEventId}</p>
                <PayloadViewer payload={e.payload} />
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}
