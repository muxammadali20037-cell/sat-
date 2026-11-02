import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/session'
import { LocaleProvider } from '@/lib/i18n/client'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Every /dashboard route requires a signed-in, non-suspended user and uses their profile language. */
export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser({ next: '/dashboard' })
  return <LocaleProvider locale={profile.locale}>{children}</LocaleProvider>
}
