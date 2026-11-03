import { getCurrentProfile } from '@/lib/auth/session'
import { LocaleProvider } from '@/lib/i18n/client'
import { getPublicLocale } from '@/lib/i18n/server'

/** Join page: the signed-in user's language, or the visitor's (cookie / browser) otherwise. */
export default async function JoinLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  return <LocaleProvider locale={profile?.locale ?? (await getPublicLocale())}>{children}</LocaleProvider>
}
