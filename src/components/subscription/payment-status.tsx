'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { apiFetch } from '@/lib/api/client'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'
import { cn } from '@/lib/utils'

type Status = 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | 'refunded'
const OPEN: Status[] = ['pending', 'processing']
const POLL_MS = 3000
const POLL_LIMIT = 60 // ~3 minutes, then the student can reload or come back later

/**
 * Display-only payment status. Polls GET /api/payments/[id] (the student's own row) while the
 * payment is open. It never confirms or changes anything — only verified provider callbacks do.
 */
export function PaymentStatusPanel({
  paymentId,
  number,
  initialStatus,
  planName,
  providerLabel,
  amountLabel,
}: {
  paymentId: string
  number: number
  initialStatus: Status
  planName: string
  providerLabel: string
  amountLabel: string
}) {
  const t = useDict(subscriptionDict)
  const r = t.returnPage
  const [status, setStatus] = React.useState<Status>(initialStatus)
  const [polls, setPolls] = React.useState(0)

  React.useEffect(() => {
    if (!OPEN.includes(status) || polls >= POLL_LIMIT) return
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiFetch<{ status: Status }>(`/api/payments/${paymentId}`)
        setStatus(data.status)
      } catch {
        // transient — keep polling
      }
      setPolls((n) => n + 1)
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [status, polls, paymentId])

  const view = {
    pending: { icon: Clock, tone: 'text-warning', title: r.waitingTitle, body: format(r.waitingBody, { provider: providerLabel }) },
    processing: { icon: Clock, tone: 'text-warning', title: r.waitingTitle, body: format(r.waitingBody, { provider: providerLabel }) },
    succeeded: { icon: CheckCircle2, tone: 'text-success', title: r.succeededTitle, body: format(r.succeededBody, { plan: planName }) },
    failed: { icon: XCircle, tone: 'text-destructive', title: r.failedTitle, body: r.failedBody },
    canceled: { icon: XCircle, tone: 'text-muted-foreground', title: r.canceledTitle, body: r.canceledBody },
    refunded: { icon: RotateCcw, tone: 'text-muted-foreground', title: r.refundedTitle, body: r.refundedBody },
  }[status]
  const Icon = view.icon
  const open = OPEN.includes(status)

  return (
    <div className="max-w-xl rounded-xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="tabular">{format(r.paymentNumber, { number })}</span>
        <Badge variant={status === 'succeeded' ? 'success' : status === 'failed' ? 'destructive' : open ? 'warning' : 'neutral'}>
          {t.status[status]}
        </Badge>
      </div>
      <div className="mt-6 flex items-start gap-4" aria-live="polite">
        <Icon className={cn('mt-0.5 size-7 shrink-0', view.tone, open && 'motion-safe:animate-pulse')} aria-hidden />
        <div>
          <h2 className="text-[21px] font-semibold leading-tight">{view.title}</h2>
          <p className="mt-2 text-[15px] text-muted-foreground">{view.body}</p>
          {open && polls >= POLL_LIMIT && (
            <p className="mt-2 text-sm text-muted-foreground">{format(r.stillWaiting, { provider: providerLabel })}</p>
          )}
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{t.history.plan}</dt>
          <dd className="font-medium">{planName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t.history.amount}</dt>
          <dd className="font-medium tabular">{amountLabel}</dd>
        </div>
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        {status === 'succeeded' ? (
          <Button asChild>
            <Link href="/dashboard">{r.goToDashboard}</Link>
          </Button>
        ) : null}
        <Button asChild variant={status === 'succeeded' ? 'secondary' : 'primary'}>
          <Link href="/dashboard/subscription">{r.backToPlans}</Link>
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">{r.displayOnly}</p>
    </div>
  )
}
