import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Ban, LogOut } from 'lucide-react'
import { Logo } from '@/components/layout/logo'
import { Button } from '@/components/ui/button'
import { getCurrentProfile } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { publicDict } from '@/lib/i18n/dictionaries/public'
import { signOutAction } from '@/features/auth/sign-out'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Where requireUser() sends suspended accounts. Active accounts are sent back to the dashboard. */
export default async function AccountSuspendedPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (!profile.isSuspended) redirect('/dashboard')

  const t = await getDict(publicDict)
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center px-4 sm:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-20">
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-lg bg-warning-soft text-warning-foreground">
            <Ban className="size-5" aria-hidden />
          </span>
          <h1 className="mt-5 text-[24px] font-semibold leading-tight text-foreground">{t.suspended.title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t.suspended.body}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t.suspended.next}</p>
          <p className="mt-3 text-sm text-foreground">{profile.email}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/contact">{t.suspended.contact}</Link>
            </Button>
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                <LogOut aria-hidden />
                {t.suspended.signOut}
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
