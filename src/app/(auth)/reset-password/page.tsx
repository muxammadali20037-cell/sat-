import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/card'
import { AuthCard, NotConfiguredAlert } from '@/components/auth/auth-card'
import { ResetPasswordForm } from '@/components/auth/recovery-forms'
import { isSupabaseConfigured } from '@/lib/env'
import { getCurrentUser } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { RECOVERY_COOKIE } from '@/features/auth/errors'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(authDict, { public: true })
  return { title: t.meta.reset, robots: { index: false, follow: false } }
}

/** Reached from /auth/confirm after a verified recovery link (session + recovery cookie). */
export default async function ResetPasswordPage() {
  const t = await getDict(authDict, { public: true })
  if (!isSupabaseConfigured) {
    return (
      <AuthCard title={t.reset.title}>
        <NotConfiguredAlert message={t.notConfigured} />
      </AuthCard>
    )
  }

  const [user, cookieStore] = await Promise.all([getCurrentUser(), cookies()])
  const recoveryFor = cookieStore.get(RECOVERY_COOKIE)?.value
  const valid = Boolean(user && recoveryFor && recoveryFor === user.id)

  if (!valid) {
    return (
      <AuthCard title={t.reset.expiredTitle}>
        <Alert variant="warning" title={t.reset.expiredBody} />
        <Button asChild size="lg" className="mt-5 w-full">
          <Link href="/forgot-password">{t.reset.requestNew}</Link>
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={t.reset.title} subtitle={t.reset.subtitle}>
      <ResetPasswordForm />
    </AuthCard>
  )
}
