import type { Metadata } from 'next'
import { LogOut } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { AppearanceForm } from '@/components/settings/appearance-form'
import {
  ChangePasswordForm,
  GoalsSettingsForm,
  LanguageSettingsForm,
  ProfileSettingsForm,
} from '@/components/settings/settings-forms'
import { getCurrentUser, requireUser } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { settingsDict } from '@/lib/i18n/dictionaries/settings'
import { localDate } from '@/lib/time'
import { signOutAction } from '@/features/auth/sign-out'
import { SUBJECTS, type Subject } from '@/features/onboarding/schemas'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(settingsDict)
  return { title: t.meta.title }
}

function SettingsSection({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid grid-cols-1 scroll-mt-24 gap-4 border-t border-border py-8 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 id={`${id}-title`} className="text-[19px] font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-6">{children}</div>
    </section>
  )
}

export default async function SettingsPage() {
  // The (app) layout already requires a ready student; this page re-checks per the DAL rule.
  const profile = await requireUser({ next: '/dashboard/settings' })
  const [t, user] = await Promise.all([getDict(settingsDict), getCurrentUser()])
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider as string | undefined]
  const hasPassword = providers.includes('email') || Boolean(user?.identities?.some((i) => i.provider === 'email'))
  const today = localDate(profile.timezone)
  const subjects = profile.preferredSubjects.filter((s): s is Subject => (SUBJECTS as readonly string[]).includes(s))

  const sections = [
    { id: 'profile', label: t.nav.profile },
    { id: 'goals', label: t.nav.goals },
    { id: 'language', label: t.nav.language },
    { id: 'appearance', label: t.nav.appearance },
    { id: 'security', label: t.nav.security },
  ]

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <nav aria-label={t.nav.label} className="-mt-2 mb-2">
        <ul className="flex flex-wrap gap-x-1 gap-y-1">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex h-10 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <SettingsSection id="profile" title={t.profile.title} description={t.profile.description}>
        <ProfileSettingsForm fullName={profile.fullName} email={profile.email} timezone={profile.timezone} />
      </SettingsSection>

      <SettingsSection id="goals" title={t.goals.title} description={t.goals.description}>
        <GoalsSettingsForm
          today={today}
          initial={{
            targetScore: profile.targetScore,
            examDate: profile.examDate,
            dailyStudyMinutes: profile.dailyStudyMinutes,
            preferredSubjects: subjects.length > 0 ? subjects : ['math', 'reading_writing'],
          }}
        />
      </SettingsSection>

      <SettingsSection id="language" title={t.language.title} description={t.language.description}>
        <LanguageSettingsForm />
      </SettingsSection>

      <SettingsSection id="appearance" title={t.appearance.title} description={t.appearance.description}>
        <AppearanceForm />
      </SettingsSection>

      <SettingsSection id="security" title={t.security.title} description={t.security.description}>
        <div className="grid grid-cols-1 gap-8">
          <div>
            <h3 className="mb-4 text-base font-semibold">{t.security.passwordTitle}</h3>
            <ChangePasswordForm hasPassword={hasPassword} />
          </div>
          <div className="border-t border-border pt-6">
            <h3 className="text-base font-semibold">{t.security.signOutTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t.security.signOutBody}</p>
            <form action={signOutAction} className="mt-4">
              <Button type="submit" variant="secondary">
                <LogOut aria-hidden />
                {t.security.signOut}
              </Button>
            </form>
          </div>
        </div>
      </SettingsSection>
    </>
  )
}
