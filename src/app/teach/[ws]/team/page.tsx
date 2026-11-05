import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { siteUrl } from '@/lib/env'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { CreateInvitationForm, InvitationList, RemoveMemberButton, type InvitationView } from '@/components/classroom/forms'
import { loadTeam, requireStaffMembership } from '@/features/classroom/server'
import { planUsage } from '@/features/classroom/plan-server'
import { can, invitableRoles } from '@/features/classroom/permissions'
import { formatDate } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.metaTitle }
}

export default async function TeamPage({ params }: { params: Promise<{ ws: string }> }) {
  const { ws } = await params
  const profile = await requireUser({ next: `/teach/${ws}/team` })
  const admin = createAdminSupabase()
  const m = await requireStaffMembership(admin, profile.id, ws)
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const t = c.teach.team
  const [team, usage] = await Promise.all([loadTeam(admin, m), planUsage(admin, ws)])
  const P = c.teach.plan
  const lim = (used: number, max: number | null) => (max === null ? format(P.unlimited, { used }) : format(P.usedOf, { used, max }))
  const manager = can(m.role, 'staff.invite')
  const tz = profile.timezone || m.workspace.timezone
  const invitations: InvitationView[] = manager
    ? await Promise.all(
        team.invitations.map(async (i) => {
          const link = siteUrl(`/join/${i.code}`)
          return { ...i, link, qr: await QRCode.toDataURL(link, { margin: 1, width: 224 }), expires: formatDate(i.expiresAt, locale, tz) }
        }),
      )
    : []

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className="space-y-10">
        <Section title={P.title} description={P.description}>
          <Card className="space-y-2 p-5" data-testid="workspace-plan">
            {usage.source === 'none' ? (
              <p className="text-sm text-foreground">{P.none}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  {usage.plan!.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {usage.source === 'default' ? P.defaultPlan : usage.until ? format(P.until, { date: formatDate(usage.until, locale, tz) }) : P.assigned}
                  </span>
                </p>
                <ul className="grid grid-cols-1 gap-1 text-[13px] text-muted-foreground sm:grid-cols-3">
                  <li>
                    {P.students}: <span className="font-medium text-foreground tabular">{lim(usage.students, usage.plan!.maxStudents)}</span>
                  </li>
                  <li>
                    {P.groups}: <span className="font-medium text-foreground tabular">{lim(usage.groups, usage.plan!.maxGroups)}</span>
                  </li>
                  <li>
                    {P.live}: <span className="font-medium text-foreground">{usage.plan!.liveLessons ? P.yes : P.no}</span>
                  </li>
                </ul>
              </>
            )}
            <p className="text-xs text-muted-foreground">{P.change}</p>
          </Card>
        </Section>

        <Section title={t.title} description={plural(team.studentCount, t.studentsTotal)}>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {team.staff.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {s.name}
                      {s.id === profile.id && <span className="text-muted-foreground"> ({t.you})</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={s.role === 'owner' ? 'primary' : 'neutral'}>{c.roles[s.role]}</Badge>
                    {manager && s.role !== 'owner' && s.id !== profile.id && <RemoveMemberButton workspaceId={ws} userId={s.id} name={s.name} />}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
        {manager && (
          <Section title={t.inviteTitle} description={t.inviteBody}>
            <div className="space-y-4">
              <Card className="p-5">
                <CreateInvitationForm workspaceId={ws} groupId={null} roles={invitableRoles(m.role).filter((r): r is 'admin' | 'teacher' | 'assistant' => r !== 'student')} />
              </Card>
              <InvitationList workspaceId={ws} items={invitations} />
            </div>
          </Section>
        )}
      </div>
    </>
  )
}
