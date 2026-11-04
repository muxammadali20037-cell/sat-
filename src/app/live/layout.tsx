import { getCurrentProfile } from '@/lib/auth/session'
import { LocaleProvider } from '@/lib/i18n/client'
import { getPublicLocale } from '@/lib/i18n/server'

/** Live lessons: the signed-in user’s language. */
export default async function LiveLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  return <LocaleProvider locale={profile?.locale ?? (await getPublicLocale())}>{children}</LocaleProvider>
}
