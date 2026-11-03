import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/session'
import { LocaleProvider } from '@/lib/i18n/client'

export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Every /teach route requires a signed-in user and uses their profile language (like /dashboard). */
export default async function TeachRootLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser({ next: '/teach' })
  return <LocaleProvider locale={profile.locale}>{children}</LocaleProvider>
}
