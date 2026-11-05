import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard, NotConfiguredAlert } from '@/components/auth/auth-card'
import { RegisterForm } from '@/components/auth/register-form'
import { OAuthButtons, OrDivider } from '@/components/auth/oauth-buttons'
import { oauthAvailability } from '@/features/auth/providers'
import { isMiniAppRequest } from '@/features/telegram/server'
import { TelegramLogin } from '@/components/auth/telegram-login'
import { isTelegramConfigured } from '@/lib/telegram/bot'
import { isPhoneAuthEnabled, isSupabaseConfigured } from '@/lib/env'
import { PhoneLogin } from '@/components/auth/phone-login'
import { getDict } from '@/lib/i18n/server'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { onboardingNext } from '@/features/auth/errors'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(authDict, { public: true })
  return { title: t.meta.register }
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next: rawNext }, t] = await Promise.all([searchParams, getDict(authDict, { public: true })])
  // After sign-up the student goes through onboarding; `next` may only point into the student app.
  const next = rawNext ? onboardingNext(rawNext) : undefined
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login'
  const telegramEnabled = isSupabaseConfigured && isTelegramConfigured()
  // Google and Apple refuse to sign in inside Telegram's in-app browser, so they are hidden there.
  const [available, miniApp] = await Promise.all([oauthAvailability(), isMiniAppRequest()])
  const oauth = miniApp ? { google: false, apple: false } : available
  const anyOAuth = oauth.google || oauth.apple

  return (
    <AuthCard
      title={t.register.title}
      subtitle={t.register.subtitle}
      footer={
        <>
          {t.register.haveAccount}{' '}
          <Link href={loginHref} className="font-medium text-primary underline-offset-4 hover:underline">
            {t.register.login}
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured && <NotConfiguredAlert message={t.notConfigured} />}
      {(telegramEnabled || anyOAuth || isPhoneAuthEnabled) && (
        <>
          <div className="grid grid-cols-1 gap-3">
            <OAuthButtons providers={oauth} next={next} disabled={!isSupabaseConfigured} />
            {telegramEnabled && <TelegramLogin labels={t.telegram} next={next} />}
            {isPhoneAuthEnabled && <PhoneLogin next={next} />}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">{telegramEnabled || isPhoneAuthEnabled ? `${t.telegram.newAccountNote} ` : ''}{t.telegram.consent}</p>
          <OrDivider label={t.google.or} />
        </>
      )}
      <RegisterForm next={next} disabled={!isSupabaseConfigured} />
    </AuthCard>
  )
}
