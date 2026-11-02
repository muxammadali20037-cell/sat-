'use client'

import * as React from 'react'
import Link from 'next/link'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/controls'
import { useLocale } from '@/lib/i18n/client'
import { signUpSchema, type SignUpInput } from '@/features/auth/schemas'
import { signUpAction } from '@/features/auth/actions'
import { PasswordChecklist, PasswordInput } from './password-input'
import { FormError } from './auth-card'
import { applyFieldErrors, useAuthMessages } from './use-auth-form'

export function RegisterForm({ next, disabled }: { next?: string; disabled?: boolean }) {
  const { t, translate } = useAuthMessages()
  const locale = useLocale()
  const [pending, startTransition] = React.useTransition()
  const [formError, setFormError] = React.useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '', acceptTerms: false, locale: locale === 'uz' ? 'uz' : 'en', next },
  })
  const password = useWatch({ control, name: 'password' }) ?? ''

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    startTransition(async () => {
      const result = await signUpAction({ ...values, locale: locale === 'uz' ? 'uz' : 'en', next })
      if (!result.ok) {
        applyFieldErrors(setError, result.fieldErrors, ['fullName', 'email', 'password', 'acceptTerms'])
        setFormError(result.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4">
      <FormError message={formError} />
      <FormField id="register-name" label={t.fields.fullName} error={translate(errors.fullName?.message)}>
        {(aria) => <Input {...aria} {...register('fullName')} autoComplete="name" placeholder={t.placeholders.fullName} />}
      </FormField>
      <FormField id="register-email" label={t.fields.email} error={translate(errors.email?.message)}>
        {(aria) => (
          <Input {...aria} {...register('email')} type="email" autoComplete="email" inputMode="email" placeholder={t.placeholders.email} />
        )}
      </FormField>
      <div className="grid grid-cols-1 gap-2">
        <FormField id="register-password" label={t.fields.password} error={translate(errors.password?.message)}>
          {(aria) => (
            <PasswordInput
              {...aria}
              aria-describedby={[aria['aria-describedby'], 'register-password-rules'].filter(Boolean).join(' ')}
              {...register('password')}
              autoComplete="new-password"
              showLabel={t.fields.showPassword}
              hideLabel={t.fields.hidePassword}
            />
          )}
        </FormField>
        <PasswordChecklist id="register-password-rules" password={password} labels={t.passwordRules} />
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        <div className="flex items-start gap-3">
          <Controller
            control={control}
            name="acceptTerms"
            render={({ field }) => (
              <Checkbox
                id="register-terms"
                checked={field.value === true}
                onCheckedChange={(v) => field.onChange(v === true)}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={errors.acceptTerms ? true : undefined}
                aria-describedby={errors.acceptTerms ? 'register-terms-error' : 'register-terms-minors'}
                className="mt-0.5 size-5"
              />
            )}
          />
          <label htmlFor="register-terms" className="text-sm leading-relaxed text-foreground">
            {t.register.termsPrefix}{' '}
            <Link href="/terms" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
              {t.register.terms}
            </Link>{' '}
            {t.register.and}{' '}
            <Link href="/privacy" target="_blank" className="font-medium text-primary underline-offset-4 hover:underline">
              {t.register.privacy}
            </Link>
            .
          </label>
        </div>
        <p id="register-terms-minors" className="pl-8 text-[13px] text-muted-foreground">
          {t.register.minors}
        </p>
        {errors.acceptTerms && (
          <p id="register-terms-error" role="alert" className="pl-8 text-[13px] text-destructive">
            {translate(errors.acceptTerms.message)}
          </p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled}>
        {t.register.submit}
      </Button>
    </form>
  )
}
