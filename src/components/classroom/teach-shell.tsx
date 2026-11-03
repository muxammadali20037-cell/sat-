import { AppShell } from '@/components/layout/app-shell'
import type { NavItem, NavSection } from '@/config/navigation'
import { ROLE_LABELS } from '@/config/roles'
import { getDict } from '@/lib/i18n/server'
import { commonDict } from '@/lib/i18n/dictionaries/common'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { getMyNotifications } from '@/features/notifications/server'
import type { CurrentProfile } from '@/lib/auth/session'
import type { Membership } from '@/features/classroom/server'

/** Teacher app chrome. Inside a workspace: Groups and (for everyone on staff) Team. */
export async function TeachShell({ profile, membership, children }: { profile: CurrentProfile; membership?: Membership; children: React.ReactNode }) {
  const [t, c, notifications] = await Promise.all([getDict(commonDict), getDict(classroomDict), getMyNotifications()])
  const base = membership ? `/teach/${membership.workspace.id}` : '/teach'
  const sections: NavSection[] = membership
    ? [
        {
          title: membership.workspace.name,
          items: [
            { href: base, labelKey: 'groups', icon: 'groups', exact: true },
            { href: `${base}/team`, labelKey: 'team', icon: 'team' },
          ],
        },
      ]
    : [{ items: [{ href: '/teach', labelKey: 'all', icon: 'teach', exact: true }] }]
  const account: NavItem[] = [
    ...(membership ? [{ href: '/teach', labelKey: 'all', icon: 'teach' as const, exact: true }] : []),
    { href: '/dashboard', labelKey: 'studentApp', icon: 'home' },
  ]
  return (
    <AppShell
      variant="teach"
      sections={sections}
      accountItems={account}
      labels={{ ...c.teach.nav, all: c.teach.nav.all }}
      user={{
        name: profile.fullName,
        email: profile.email,
        roleLabel: membership ? c.roles[membership.role] : ROLE_LABELS[profile.role],
        isStaff: false,
      }}
      logoutLabel={t.nav.logout}
      notifications={{ ...notifications }}
    >
      {children}
    </AppShell>
  )
}
