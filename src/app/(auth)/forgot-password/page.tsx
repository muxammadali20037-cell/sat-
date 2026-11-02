import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthCard, NotConfiguredAlert } from '@/components/auth/auth-card'
import { ForgotPasswordForm } from '@/components/auth/recovery-forms'
import { isSupabaseConfigured } from '@/lib/env'
import { getDict } from '@/lib/i18n/server'
import { authDict } from '@/lib/i18n/dictionaries/auth'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(authDict, { public: true })
  return { title: t.meta.forgot }
}

export default async function ForgotPasswordPage() {
  const t = await getDict(authDict, { public: true })
  return (
    <AuthCard
      title={t.forgot.title}
      subtitle={t.forgot.subtitle}
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t.forgot.back}
        </Link>
      }
    >
      {!isSupabaseConfigured && <NotConfiguredAlert message={t.notConfigured} />}
      <ForgotPasswordForm disabled={!isSupabaseConfigured} />
    </AuthCard>
  )
}
