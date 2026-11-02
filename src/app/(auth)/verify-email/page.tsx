import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { z } from 'zod'
import { AuthCard, NotConfiguredAlert } from '@/components/auth/auth-card'
import { ResendConfirmation } from '@/components/auth/recovery-forms'
import { isSupabaseConfigured } from '@/lib/env'
import { format } from '@/lib/i18n/dict'
import { getDict } from '@/lib/i18n/server'
import { authDict } from '@/lib/i18n/dictionaries/auth'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(authDict, { public: true })
  return { title: t.meta.verify, robots: { index: false, follow: false } }
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const [{ email: rawEmail }, t] = await Promise.all([searchParams, getDict(authDict, { public: true })])
  const parsed = z.email().max(254).safeParse(rawEmail?.trim())
  const email = parsed.success ? parsed.data : undefined

  return (
    <AuthCard
      title={t.verify.title}
      footer={
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t.verify.back}
        </Link>
      }
    >
      {!isSupabaseConfigured && <NotConfiguredAlert message={t.notConfigured} />}
      <div className="flex gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Mail className="size-5" aria-hidden />
        </span>
        <p className="text-[15px] leading-relaxed text-foreground">
          {email ? format(t.verify.bodyWithEmail, { email }) : t.verify.body}
        </p>
      </div>
      <ul className="mt-5 grid grid-cols-1 gap-2 pl-14 text-sm text-muted-foreground">
        {t.verify.tips.map((tip) => (
          <li key={tip} className="list-disc">
            {tip}
          </li>
        ))}
      </ul>
      <div className="mt-7 border-t border-border pt-6">
        <ResendConfirmation initialEmail={email} disabled={!isSupabaseConfigured} />
      </div>
    </AuthCard>
  )
}
