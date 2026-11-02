'use client'

import * as React from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { signInSchema, type SignInInput } from '@/features/auth/schemas'
import { signInAction } from '@/features/auth/actions'
import { PasswordInput } from './password-input'
import { FormError } from './auth-card'
import { applyFieldErrors, useAuthMessages } from './use-auth-form'

export function LoginForm({ next, disabled }: { next?: string; disabled?: boolean }) {
  const { t, translate } = useAuthMessages()
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<{ message: string; unconfirmed: boolean } | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '', next } })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await signInAction({ ...values, next })
      if (!result.ok) {
        applyFieldErrors(setError, result.fieldErrors, ['email', 'password'])
        setFormError({ message: result.error, unconfirmed: result.reason === 'emailNotConfirmed' })
      }
    })
  })

  const email = getValues('email')
  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4">
      <FormError
        message={formError?.message ?? null}
        action={
          formError?.unconfirmed ? (
            <Link
              href={`/verify-email${email ? `?email=${encodeURIComponent(email)}` : ''}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t.login.resend}
            </Link>
          ) : undefined
        }
      />
      <FormField id="login-email" label={t.fields.email} error={translate(errors.email?.message)}>
        {(aria) => (
          <Input {...aria} {...register('email')} type="email" autoComplete="email" inputMode="email" placeholder={t.placeholders.email} />
        )}
      </FormField>
      <div className="grid grid-cols-1 gap-1.5">
        <FormField id="login-password" label={t.fields.password} error={translate(errors.password?.message)}>
          {(aria) => (
            <PasswordInput
              {...aria}
              {...register('password')}
              autoComplete="current-password"
              showLabel={t.fields.showPassword}
              hideLabel={t.fields.hidePassword}
            />
          )}
        </FormField>
        <Link href="/forgot-password" className="inline-flex min-h-10 items-center justify-self-end text-[13px] font-medium text-primary underline-offset-4 hover:underline">
          {t.login.forgot}
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled}>
        {t.login.submit}
      </Button>
    </form>
  )
}
