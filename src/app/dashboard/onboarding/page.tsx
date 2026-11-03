import type { Metadata } from 'next'
import { isUiLocale } from '@/lib/i18n/config'
import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Logo } from '@/components/layout/logo'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'
import { requireUser } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { commonDict } from '@/lib/i18n/dictionaries/common'
import { onboardingDict } from '@/lib/i18n/dictionaries/onboarding'
import { localDate } from '@/lib/time'
import { signOutAction } from '@/features/auth/sign-out'
import { onboardingNext } from '@/features/auth/errors'
import { SUBJECTS, type Subject } from '@/features/onboarding/schemas'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(onboardingDict)
  return { title: t.meta.title }
}

/** Outside the app shell (dashboard/layout.tsx already requires a signed-in user). */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const profile = await requireUser({ next: '/dashboard/onboarding' })
  if (profile.onboardingCompleted) redirect('/dashboard')

  const [{ next: rawNext }, t, common] = await Promise.all([searchParams, getDict(onboardingDict), getDict(commonDict)])
  const next = rawNext ? onboardingNext(rawNext) : undefined
  const today = localDate(profile.timezone)
  const subjects = profile.preferredSubjects.filter((s): s is Subject => (SUBJECTS as readonly string[]).includes(s))

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-8">
        <Logo href="/dashboard/onboarding" />
        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            {common.nav.logout}
          </button>
        </form>
      </header>
      <main id="main" className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="mb-8 max-w-xl text-[15px] text-muted-foreground">{t.intro}</p>
        <OnboardingWizard
          today={today}
          next={next}
          initial={{
            fullName: profile.fullName,
            locale: isUiLocale(profile.locale) ? profile.locale : 'en',
            satLevel: profile.satLevel,
            targetScore: profile.targetScore ?? 1200,
            examDate: profile.examDate && profile.examDate > today ? profile.examDate : null,
            dailyStudyMinutes: profile.dailyStudyMinutes ?? 30,
            preferredSubjects: subjects.length > 0 ? subjects : ['math', 'reading_writing'],
          }}
        />
      </main>
    </div>
  )
}
