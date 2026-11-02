'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { subscriptionDict } from '@/lib/i18n/dictionaries/subscription'

async function call(path: string, body?: unknown) {
  await apiFetch(path, { method: 'POST', body: body ?? {} })
}

/** Cancel / resume renewal and drop a scheduled change. Server re-checks everything. */
export function SubscriptionActions({
  cancelAtPeriodEnd,
  accessUntil,
  scheduledPlanName,
  currentPlanName,
}: {
  currentPlanName: string
  cancelAtPeriodEnd: boolean
  accessUntil: string
  scheduledPlanName: string | null
}) {
  const t = useDict(subscriptionDict)
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [busy, setBusy] = React.useState<'cancel' | 'resume' | 'keep' | null>(null)

  async function run(kind: 'cancel' | 'resume' | 'keep') {
    setBusy(kind)
    try {
      if (kind === 'cancel') await call('/api/subscription/cancel')
      if (kind === 'resume') await call('/api/subscription/resume')
      if (kind === 'keep') await call('/api/subscription/cancel-scheduled-change')
      toast.success(kind === 'cancel' ? t.current.canceled : kind === 'resume' ? t.current.resumed : t.current.keptPlan)
      setConfirmOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {scheduledPlanName && (
        <Button variant="secondary" size="sm" loading={busy === 'keep'} onClick={() => void run('keep')}>
          {format(t.current.keepPlan, { plan: currentPlanName })}
        </Button>
      )}
      {cancelAtPeriodEnd ? (
        <Button variant="secondary" size="sm" loading={busy === 'resume'} onClick={() => void run('resume')}>
          {t.current.resume}
        </Button>
      ) : (
        <>
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            {t.current.cancel}
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={t.current.cancelTitle}
            description={format(t.current.cancelBody, { date: accessUntil })}
            confirmLabel={t.current.cancelConfirm}
            destructive
            loading={busy === 'cancel'}
            onConfirm={() => run('cancel')}
          />
        </>
      )}
    </div>
  )
}

export function ScheduleDowngradeButton({
  planCode,
  planName,
  currentPlanName,
  accessUntil,
}: {
  planCode: string
  planName: string
  currentPlanName: string
  accessUntil: string
}) {
  const t = useDict(subscriptionDict)
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await call('/api/subscription/schedule-downgrade', { planCode })
      toast.success(t.plans.scheduled)
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        {t.plans.scheduleDowngrade}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={format(t.plans.scheduleTitle, { plan: planName })}
        description={format(t.plans.scheduleBody, { plan: planName, current: currentPlanName, date: accessUntil })}
        confirmLabel={t.plans.scheduleConfirm}
        loading={busy}
        onConfirm={confirm}
      />
    </>
  )
}
