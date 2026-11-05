import type { Metadata } from 'next'
import { COUNTRY_CODES, countryName, guessCountry } from '@/config/countries'
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
import { getDict, getLocale } from '@/lib/i18n/server'
import { settingsDict } from '@/lib/i18n/dictionaries/settings'
import { localDate } from '@/lib/time'
import { signOutAction } from '@/features/auth/sign-out'
import { SUBJECTS, type Subject } from '@/features/onboarding/schemas'
import { createServerSupabase } from '@/lib/supabase/server'
import { myTelegramAccount } from '@/features/telegram/server'
import { isTelegramOnlyEmail } from '@/features/telegram/shared'
import { formatUzPhone } from '@/features/auth/phone'
import { DisconnectTelegramButton } from '@/components/telegram/disconnect-telegram-button'
import { DrillSettings } from '@/components/telegram/drill-settings'
import { format } from '@/lib/i18n/dict'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { TelegramLogin } from '@/components/auth/telegram-login'
import { isTelegramConfigured } from '@/lib/telegram/bot'

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
  const [t, user, db, a, locale] = await Promise.all([getDict(settingsDict), getCurrentUser(), createServerSupabase(), getDict(authDict), getLocale()])
  const telegram = await myTelegramAccount(db, profile.id)
  // Accounts created in Telegram have a placeholder address and no password.
  const telegramOnly = isTelegramOnlyEmail(profile.email)
  // Accounts created with an SMS code have a phone number and no email or password.
  const phoneOnly = !profile.email && Boolean(user?.phone)
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider as string | undefined]
  const hasPassword = !telegramOnly && !phoneOnly && (providers.includes('email') || Boolean(user?.identities?.some((i) => i.provider === 'email')))
  const social = providers.includes('apple') ? 'Apple' : providers.includes('google') ? 'Google' : null
  const METHOD_NAMES: Record<string, string> = { email: 'Email', google: 'Google', apple: 'Apple', phone: a.google.methods.phone }
  const methods = [...new Set([...(user?.identities ?? []).map((i) => i.provider), ...providers].filter((p): p is string => typeof p === 'string' && p in METHOD_NAMES))]
    .filter((p) => !(p === 'email' && telegramOnly))
    .map((p) => METHOD_NAMES[p]!)
  if (telegram) methods.push('Telegram')
  const today = localDate(profile.timezone)
  const subjects = profile.preferredSubjects.filter((s): s is Subject => (SUBJECTS as readonly string[]).includes(s))

  const sections = [
    { id: 'profile', label: t.nav.profile },
    { id: 'goals', label: t.nav.goals },
    { id: 'language', label: t.nav.language },
    { id: 'appearance', label: t.nav.appearance },
    { id: 'telegram', label: t.nav.telegram },
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
        <ProfileSettingsForm
          fullName={profile.fullName}
          email={
            telegramOnly ? `Telegram${telegram?.username ? ` (@${telegram.username})` : ''}` : phoneOnly ? formatUzPhone(`+${user!.phone!.replace(/^\+/, '')}`) : profile.email
          }
          timezone={profile.timezone}
          countryCode={profile.countryCode ?? guessCountry(profile.timezone)}
          countries={COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) }))}
        />
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

      <SettingsSection id="telegram" title={t.telegram.title} description={t.telegram.description}>
        <p className="text-sm">
          {telegram ? format(t.telegram.connected, { username: telegram.username ? ` (@${telegram.username})` : '' }) : t.telegram.notConnected}
        </p>
        {telegram?.phone_number && <p className="mt-2 text-sm text-muted-foreground">{format(t.telegram.phone, { phone: telegram.phone_number })}</p>}
        {telegram && isTelegramConfigured() && <DrillSettings enabled={telegram.drills_enabled} labels={t.telegram} />}
        {telegramOnly ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.telegram.telegramOnly}</p>
        ) : telegram ? (
          <DisconnectTelegramButton label={t.telegram.disconnect} doneLabel={t.telegram.disconnected} />
        ) : (
          isTelegramConfigured() && (
            <div className="mt-4 max-w-sm">
              <TelegramLogin intent="link" labels={{ ...a.telegram, continue: t.telegram.connect }} />
            </div>
          )
        )}
      </SettingsSection>

      <SettingsSection id="security" title={t.security.title} description={t.security.description}>
        <div className="grid grid-cols-1 gap-8">
          <div>
            <h3 className="mb-4 text-base font-semibold">{t.security.passwordTitle}</h3>
            {methods.length > 0 && (
              <p className="mb-4 text-sm text-muted-foreground" data-testid="signin-methods">
                {t.security.methodsLabel}: <span className="font-medium text-foreground">{methods.join(', ')}</span>
              </p>
            )}
            <ChangePasswordForm
              hasPassword={hasPassword}
              noPasswordNote={telegramOnly ? t.telegram.telegramOnly : phoneOnly ? t.telegram.phoneOnly : social ? format(t.security.googleNote, { provider: social }) : undefined}
            />
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
