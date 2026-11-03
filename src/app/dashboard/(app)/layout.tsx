import { requireStudentReady } from '@/lib/auth/session'
import { getDict } from '@/lib/i18n/server'
import { commonDict } from '@/lib/i18n/dictionaries/common'
import { AppShell } from '@/components/layout/app-shell'
import { STUDENT_ACCOUNT_NAV, STUDENT_MOBILE_TABS, STUDENT_NAV } from '@/config/navigation'
import { ROLE_LABELS, STAFF_ROLES, hasRole } from '@/config/roles'
import { getEntitlements } from '@/features/entitlements/server'
import { getMyNotifications } from '@/features/notifications/server'
import { defineDict } from '@/lib/i18n/dict'
import { Suspense } from 'react'
import { FlashToast } from '@/components/layout/flash-toast'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { listMemberships } from '@/features/classroom/server'
import { isStaffRole } from '@/features/classroom/permissions'

const notificationsDict = defineDict({
  en: { title: 'Notifications', empty: 'No notifications yet.', markRead: 'Mark all as read' },
  uz: { title: 'Bildirishnomalar', empty: "Hozircha bildirishnomalar yo'q.", markRead: "Barchasini o'qilgan deb belgilash" },
  ru: { title: 'Уведомления', empty: 'Уведомлений пока нет.', markRead: 'Отметить все как прочитанные' },
})

/** Student app chrome: sidebar (desktop), drawer + bottom tabs (mobile). */
export default async function StudentAppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStudentReady()
  const t = await getDict(commonDict)
  const [entitlements, notifications, notificationLabels, memberships] = await Promise.all([
    getEntitlements(profile.id).catch(() => null),
    getMyNotifications(),
    getDict(notificationsDict),
    listMemberships(createAdminSupabase(), profile.id).catch(() => []),
  ])
  const staff = hasRole(profile.role, STAFF_ROLES)
  const teaches = memberships.some((m) => isStaffRole(m.role))

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
      switchLink={staff ? { href: '/admin', label: t.nav.admin } : teaches ? { href: '/teach', label: t.nav.teach } : undefined}
      notifications={{ ...notifications, labels: notificationLabels }}
    >
      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
      {children}
    </AppShell>
  )
}
