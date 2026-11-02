import { requireStudentReady } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { commonDict } from '@/lib/i18n/dictionaries/common'
import { AppShell } from '@/components/layout/app-shell'
import { STUDENT_ACCOUNT_NAV, STUDENT_MOBILE_TABS, STUDENT_NAV } from '@/config/navigation'
import { ROLE_LABELS, STAFF_ROLES, hasRole } from '@/config/roles'
import { getEntitlements } from '@/features/entitlements/server'

/** Student app chrome: sidebar (desktop), drawer + bottom tabs (mobile). */
export default async function StudentAppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStudentReady()
  const t = await getDict(commonDict)
  const entitlements = await getEntitlements(profile.id).catch(() => null)
  const staff = hasRole(profile.role, STAFF_ROLES)

  return (
    <AppShell
      variant="student"
      sections={STUDENT_NAV}
      accountItems={STUDENT_ACCOUNT_NAV}
      mobileTabs={STUDENT_MOBILE_TABS}
      labels={t.nav}
      user={{
        name: profile.fullName,
        email: profile.email,
        roleLabel: ROLE_LABELS[profile.role],
        isStaff: staff,
        planName: entitlements ? `${entitlements.planName} plan` : undefined,
      }}
      logoutLabel={t.nav.logout}
      switchLink={staff ? { href: '/admin', label: t.nav.admin } : undefined}
    >
      {children}
    </AppShell>
  )
}
