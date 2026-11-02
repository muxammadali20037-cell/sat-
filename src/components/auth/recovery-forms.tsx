'use client'

import * as React from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { format } from '@/lib/i18n/dict'
import { emailOnlySchema, resetPasswordSchema, type EmailOnlyInput, type ResetPasswordInput } from '@/features/auth/schemas'
import { requestPasswordResetAction, resendConfirmationAction, updatePasswordAction } from '@/features/auth/actions'
import { PasswordChecklist, PasswordInput } from './password-input'
import { FormError } from './auth-card'
import { applyFieldErrors, useAuthMessages } from './use-auth-form'

/** /forgot-password — always ends in the same "check your email" state (no account probing). */
export function ForgotPasswordForm({ disabled }: { disabled?: boolean }) {
  const { t, translate } = useAuthMessages()
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EmailOnlyInput>({ resolver: zodResolver(emailOnlySchema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await requestPasswordResetAction(values)
      if (result.ok) setSentTo(values.email.trim())
      else {
        applyFieldErrors(setError, result.fieldErrors, ['email'])
        setFormError(result.error)
      }
    })
  })

  if (sentTo) {
    return (
      <div className="grid grid-cols-1 gap-4" role="status">
        <div className="flex gap-3 rounded-lg border border-success/25 bg-success-soft p-4 text-sm">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <div>
            <p className="font-medium text-foreground">{t.forgot.sentTitle}</p>
            <p className="mt-1 text-muted-foreground">{format(t.forgot.sentBody, { email: sentTo })}</p>
          </div>
        </div>
        <Button asChild variant="secondary" size="lg" className="w-full">
          <Link href="/login">{t.forgot.back}</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4">
      <FormError message={formError} />
      <FormField id="forgot-email" label={t.fields.email} error={translate(errors.email?.message)}>
        {(aria) => (
          <Input {...aria} {...register('email')} type="email" autoComplete="email" inputMode="email" placeholder={t.placeholders.email} />
        )}
      </FormField>
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled}>
        {t.forgot.submit}
      </Button>
    </form>
  )
}

/** /reset-password — requires the recovery session set by /auth/confirm. */
export function ResetPasswordForm({ disabled }: { disabled?: boolean }) {
  const { t, translate } = useAuthMessages()
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '', confirmPassword: '' } })
  const password = useWatch({ control, name: 'password' }) ?? ''

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await updatePasswordAction(values)
      if (!result.ok) {
        applyFieldErrors(setError, result.fieldErrors, ['password', 'confirmPassword'])
        setFormError(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4">
      <FormError message={formError} />
      <div className="grid grid-cols-1 gap-2">
        <FormField id="reset-password" label={t.fields.newPassword} error={translate(errors.password?.message)}>
          {(aria) => (
            <PasswordInput
              {...aria}
              aria-describedby={[aria['aria-describedby'], 'reset-password-rules'].filter(Boolean).join(' ')}
              {...register('password')}
              autoComplete="new-password"
              showLabel={t.fields.showPassword}
              hideLabel={t.fields.hidePassword}
            />
          )}
        </FormField>
        <PasswordChecklist id="reset-password-rules" password={password} labels={t.passwordRules} />
      </div>
      <FormField id="reset-confirm" label={t.fields.confirmPassword} error={translate(errors.confirmPassword?.message)}>
        {(aria) => (
          <PasswordInput
            {...aria}
            {...register('confirmPassword')}
            autoComplete="new-password"
            showLabel={t.fields.showPassword}
            hideLabel={t.fields.hidePassword}
          />
        )}
      </FormField>
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled}>
        {t.reset.submit}
      </Button>
    </form>
  )
}

/** /verify-email resend control. The email can be corrected before resending. */
export function ResendConfirmation({ initialEmail, disabled }: { initialEmail?: string; disabled?: boolean }) {
  const { t, translate } = useAuthMessages()
  const [pending, startTransition] = React.useTransition()
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EmailOnlyInput>({ resolver: zodResolver(emailOnlySchema), defaultValues: { email: initialEmail ?? '' } })

  const onSubmit = handleSubmit((values) => {
    setStatus(null)
    startTransition(async () => {
      const result = await resendConfirmationAction(values)
      if (result.ok) setStatus({ ok: true, message: t.verify.resent })
      else {
        applyFieldErrors(setError, result.fieldErrors, ['email'])
        setStatus({ ok: false, message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-3">
      <p className="text-sm font-medium text-foreground">{t.verify.resendLabel}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="grid grid-cols-1 gap-1.5">
          <Input
            {...register('email')}
            id="resend-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            aria-label={t.verify.emailLabel}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'resend-email-error' : undefined}
          />
          {errors.email && (
            <p id="resend-email-error" role="alert" className="text-[13px] text-destructive">
              {translate(errors.email.message)}
            </p>
          )}
        </div>
        <Button type="submit" variant="secondary" loading={pending} disabled={disabled}>
          {t.verify.resend}
        </Button>
      </div>
      {status && (
        <p role={status.ok ? 'status' : 'alert'} className={status.ok ? 'text-[13px] text-success' : 'text-[13px] text-destructive'}>
          {status.message}
        </p>
      )}
    </form>
  )
}
