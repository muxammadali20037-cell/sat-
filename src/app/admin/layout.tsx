import type { Metadata } from 'next'
import { requireRole } from '@/lib/auth/session'
import { AppShell } from '@/components/layout/app-shell'
import { ADMIN_NAV } from '@/config/navigation'
import { ROLE_LABELS, STAFF_ROLES } from '@/config/roles'
import { LocaleProvider } from '@/lib/i18n/client'

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } }

/** Admin is English-only in v1 and visible to staff roles; each page re-checks its own role set. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin' })
  const sections = ADMIN_NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.roles || i.roles.includes(profile.role)),
  })).filter((s) => s.items.length > 0)

  return (
    <LocaleProvider locale="en">
      <AppShell
        variant="admin"
        sections={sections}
        user={{ name: profile.fullName, email: profile.email, roleLabel: ROLE_LABELS[profile.role], isStaff: true }}
        logoutLabel="Log out"
        switchLink={{ href: '/dashboard', label: 'Student view' }}
      >
        {children}
      </AppShell>
    </LocaleProvider>
  )
}
