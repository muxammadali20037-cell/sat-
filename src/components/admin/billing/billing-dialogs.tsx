'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, CalendarPlus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormField, Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/controls'
import { Alert } from '@/components/ui/card'
import { toast } from '@/components/ui/toast'
import { minorToMajorString } from '@/lib/payments/purpose'
import { formatMoney } from '@/lib/utils'
import { refundPaymentAction, recordOfflinePaymentAction } from '@/features/payments/admin-actions'
import { grantAccessAction } from '@/features/subscriptions/admin-actions'

type PlanOption = { code: string; name: string; priceMinor: number; currency: string; usdMinor: number | null }
type FieldErrors = Record<string, string[] | undefined>

/** "Grant or extend access" — trusted admin process, no payment and no revenue. */
export function GrantAccessDialog({ plans, defaultEmail, defaultPlan }: { plans: PlanOption[]; defaultEmail?: string; defaultPlan?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [errors, setErrors] = React.useState<FieldErrors>({})
  const paid = plans.filter((p) => p.priceMinor > 0)

  function submit(form: FormData) {
    startTransition(async () => {
      const result = await grantAccessAction({
        email: String(form.get('email') ?? ''),
        planCode: String(form.get('planCode') ?? ''),
        days: Number(form.get('days') ?? 0),
        reason: String(form.get('reason') ?? ''),
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success('Access granted')
      setErrors({})
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus aria-hidden /> Grant or extend access
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant or extend access</DialogTitle>
          <DialogDescription>
            Gives days on a plan without a payment (scholarships, support cases). No revenue is recorded. Extends from the current
            period end when the student already has a plan; choosing another plan switches it without pro-rata conversion.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid grid-cols-1 gap-4">
          <FormField id="grant-email" label="Student email" required error={errors.email}>
            {(a) => <Input {...a} name="email" type="email" defaultValue={defaultEmail} required autoComplete="off" />}
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="grant-plan" label="Plan" required error={errors.planCode}>
              {(a) => (
                <NativeSelect {...a} name="planCode" defaultValue={defaultPlan ?? paid[0]?.code}>
                  {paid.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="grant-days" label="Days" required error={errors.days}>
              {(a) => <Input {...a} name="days" type="number" min={1} max={366} defaultValue={30} required />}
            </FormField>
          </div>
          <FormField id="grant-reason" label="Reason (kept in the audit log)" required error={errors.reason}>
            {(a) => <Textarea {...a} name="reason" minLength={5} maxLength={500} required />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Grant access
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Record offline payment" — bank transfer / cash, applied through billing_apply_successful_payment. */
export function OfflinePaymentDialog({ plans, defaultEmail }: { plans: PlanOption[]; defaultEmail?: string }) {
  const router = useRouter()
  const paid = plans.filter((p) => p.priceMinor > 0)
  const [open, setOpen] = React.useState(false)
  const [pending, startTransition] = React.useTransition()
  const [errors, setErrors] = React.useState<FieldErrors>({})
  const [planCode, setPlanCode] = React.useState(paid[0]?.code ?? '')
  const [currency, setCurrency] = React.useState<'UZS' | 'USD'>('UZS')
  const suggest = (code: string, cur: 'UZS' | 'USD') => {
    const plan = paid.find((p) => p.code === code)
    const minor = plan ? (cur === 'UZS' ? plan.priceMinor : plan.usdMinor) : null
    return minor ? minorToMajorString(minor) : ''
  }
  const [amount, setAmount] = React.useState(() => suggest(paid[0]?.code ?? '', 'UZS'))

  function submit(form: FormData) {
    startTransition(async () => {
      const result = await recordOfflinePaymentAction({
        email: String(form.get('email') ?? ''),
        planCode,
        amount,
        currency,
        months: Number(form.get('months') ?? 1),
        reference: String(form.get('reference') ?? ''),
        note: String(form.get('note') ?? ''),
      })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.error)
        return
      }
      toast.success('Payment recorded')
      setErrors({})
      setOpen(false)
      if (result.data) router.push(`/admin/payments/${result.data.paymentId}`)
      else router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Banknote aria-hidden /> Record offline payment
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record offline payment</DialogTitle>
          <DialogDescription>
            For money already received by bank transfer or cash. Creates a manual payment and applies it to the student&apos;s
            subscription exactly like a provider payment. Only record money that has actually arrived.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid grid-cols-1 gap-4">
          <FormField id="offline-email" label="Student email" required error={errors.email}>
            {(a) => <Input {...a} name="email" type="email" defaultValue={defaultEmail} required autoComplete="off" />}
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="offline-plan" label="Plan" required error={errors.planCode}>
              {(a) => (
                <NativeSelect
                  {...a}
                  value={planCode}
                  onChange={(e) => {
                    setPlanCode(e.target.value)
                    setAmount(suggest(e.target.value, currency))
                  }}
                >
                  {paid.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="offline-months" label="Months" required error={errors.months}>
              {(a) => <Input {...a} name="months" type="number" min={1} max={12} defaultValue={1} required />}
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <FormField id="offline-amount" label="Amount received (major units)" required error={errors.amount}>
              {(a) => <Input {...a} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />}
            </FormField>
            <FormField id="offline-currency" label="Currency" error={errors.currency}>
              {(a) => (
                <NativeSelect
                  {...a}
                  value={currency}
                  onChange={(e) => {
                    const next = e.target.value as 'UZS' | 'USD'
                    setCurrency(next)
                    setAmount(suggest(planCode, next))
                  }}
                >
                  <option value="UZS">UZS</option>
                  <option value="USD">USD</option>
                </NativeSelect>
              )}
            </FormField>
          </div>
          <FormField id="offline-reference" label="Bank / receipt reference" description="Recorded once — a duplicate reference is refused." error={errors.reference}>
            {(a) => <Input {...a} name="reference" maxLength={100} autoComplete="off" />}
          </FormField>
          <FormField id="offline-note" label="Note (kept in the audit log)" required error={errors.note}>
            {(a) => <Textarea {...a} name="note" minLength={3} maxLength={500} required />}
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Refund record. Money is returned in the provider cabinet; this only records it (and can revoke access). */
export function RefundDialog({
  paymentId,
  number,
  amountMinor,
  currency,
  providerLabel,
}: {
  paymentId: string
  number: number
  amountMinor: number
  currency: string
  providerLabel: string
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [amount, setAmount] = React.useState(minorToMajorString(amountMinor))
  const [reason, setReason] = React.useState('')
  const [revoke, setRevoke] = React.useState(true)
  const [errors, setErrors] = React.useState<FieldErrors>({})

  async function confirm() {
    setLoading(true)
    const result = await refundPaymentAction({ paymentId, amount, reason, revokeAccess: revoke })
    setLoading(false)
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {})
      toast.error(result.error)
      return
    }
    toast.success('Refund recorded')
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <RotateCcw aria-hidden /> Refund payment
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Refund payment #${number}`}
        description={`Paid: ${formatMoney(amountMinor, currency)}. This records the refund in SAT MASTER; it does not move money.`}
        confirmLabel="Refund payment"
        destructive
        loading={loading}
        onConfirm={confirm}
      >
        <div className="grid grid-cols-1 gap-4">
          <Alert variant="warning">
            Return the money in the {providerLabel} merchant cabinet first (or by bank transfer for manual payments), then record it here.
          </Alert>
          <FormField id="refund-amount" label={`Amount (${currency}, at most the amount paid)`} required error={errors.amount}>
            {(a) => <Input {...a} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />}
          </FormField>
          <FormField id="refund-reason" label="Reason" required error={errors.reason}>
            {(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
          </FormField>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={revoke} onCheckedChange={setRevoke} aria-label="Revoke access" className="mt-0.5" />
            <span>
              <span className="font-medium">Revoke access</span>
              <span className="block text-muted-foreground">Cancels the subscription this payment paid for. The student moves to the free plan now.</span>
            </span>
          </label>
        </div>
      </ConfirmDialog>
    </>
  )
}
