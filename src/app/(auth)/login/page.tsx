import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert } from '@/components/ui/card'
import { AuthCard, NotConfiguredAlert } from '@/components/auth/auth-card'
import { LoginForm } from '@/components/auth/login-form'
import { GoogleButton, OrDivider } from '@/components/auth/google-button'
import { TelegramLogin } from '@/components/auth/telegram-login'
import { isTelegramConfigured } from '@/lib/telegram/bot'
import { isGoogleAuthEnabled, isPhoneAuthEnabled, isSupabaseConfigured } from '@/lib/env'
import { PhoneLogin } from '@/components/auth/phone-login'
import { getDict } from '@/lib/i18n/server'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { postAuthRedirect } from '@/features/auth/errors'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(authDict, { public: true })
  return { title: t.meta.login }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const [{ next: rawNext, error }, t] = await Promise.all([searchParams, getDict(authDict, { public: true })])
  const next = rawNext ? postAuthRedirect(rawNext) : undefined
  const queryError = error === 'link_expired' || error === 'oauth_failed' || error === 'link_other_browser' ? t.queryErrors[error] : null
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : '/register'
  const telegramEnabled = isSupabaseConfigured && isTelegramConfigured()

  return (
    <AuthCard
      title={t.login.title}
      subtitle={t.login.subtitle}
      footer={
        <>
          {t.login.noAccount}{' '}
          <Link href={registerHref} className="font-medium text-primary underline-offset-4 hover:underline">
            {t.login.createAccount}
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured && <NotConfiguredAlert message={t.notConfigured} />}
      {queryError && <Alert variant="warning" title={queryError} className="mb-5" />}
      {(telegramEnabled || isGoogleAuthEnabled || isPhoneAuthEnabled) && (
        <>
          <div className="grid grid-cols-1 gap-3">
            {telegramEnabled && <TelegramLogin labels={t.telegram} next={next} />}
            {isGoogleAuthEnabled && <GoogleButton next={next} disabled={!isSupabaseConfigured} />}
            {isPhoneAuthEnabled && <PhoneLogin next={next} />}
          </div>
          {(telegramEnabled || isPhoneAuthEnabled) && <p className="mt-2 text-center text-xs text-muted-foreground">{t.telegram.newAccountNote}</p>}
          <OrDivider label={t.google.or} />
        </>
      )}
      <LoginForm next={next} disabled={!isSupabaseConfigured} />
    </AuthCard>
  )
}
