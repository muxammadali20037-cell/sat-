'use client'

import * as React from 'react'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { formatUzPhone, normalizeUzPhone } from '@/features/auth/phone'
import { sendPhoneCodeAction, verifyPhoneCodeAction } from '@/features/auth/phone-actions'

const RESEND_SECONDS = 60

/** Phone number → SMS code → signed in (a new account is created for a new number). */
export function PhoneLogin({ next }: { next?: string }) {
  const t = useDict(authDict).phone
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = React.useState('+998 ')
  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, start] = React.useTransition()
  const [wait, setWait] = React.useState(0)
  const codeRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (wait <= 0) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])

  const normalized = normalizeUzPhone(phone)

  const send = () =>
    start(async () => {
      setError(null)
      if (!normalized) return setError(t.invalidPhone)
      const res = await sendPhoneCodeAction({ phone: normalized })
      if (!res.ok) return setError(res.error)
      setStep('code')
      setCode('')
      setWait(RESEND_SECONDS)
      setTimeout(() => codeRef.current?.focus(), 50)
    })

  const verify = () =>
    start(async () => {
      setError(null)
      if (!normalized) return
      // On success the action redirects; a result only comes back on failure.
      const res = await verifyPhoneCodeAction({ phone: normalized, code, next })
      if (res && !res.ok) setError(res.error)
    })

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setOpen(true)}>
        <Smartphone aria-hidden />
        {t.continue}
      </Button>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {step === 'phone' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          noValidate
        >
          <label htmlFor="phone-login" className="text-sm font-medium">
            {t.phoneLabel}
          </label>
          <Input
            id="phone-login"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="mt-1.5"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby="phone-login-hint"
          />
          <p id="phone-login-hint" className="mt-1.5 text-xs text-muted-foreground">
            {t.phoneHint}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="mt-3 w-full" loading={pending}>
            {t.sendCode}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            verify()
          }}
          noValidate
        >
          <p className="text-sm">{format(t.codeSent, { phone: normalized ? formatUzPhone(normalized) : phone })}</p>
          <label htmlFor="phone-code" className="mt-3 block text-sm font-medium">
            {t.codeLabel}
          </label>
          <Input
            ref={codeRef}
            id="phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            className="mt-1.5 font-mono text-lg tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="mt-3 w-full" loading={pending} disabled={code.length !== 6}>
            {t.verify}
          </Button>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <button type="button" className="text-muted-foreground underline-offset-4 hover:underline" onClick={() => setStep('phone')}>
              {t.changeNumber}
            </button>
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
              disabled={wait > 0 || pending}
              onClick={send}
            >
              {wait > 0 ? format(t.resendIn, { seconds: wait }) : t.resend}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
