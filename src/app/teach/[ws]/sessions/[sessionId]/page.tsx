import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { AttendanceForm } from '@/components/classroom/lesson-forms'
import { requireStaffMembership } from '@/features/classroom/server'
import { loadSessionForTeacher } from '@/features/classroom/lesson-server'
import { formatDate } from '@/features/dashboard/format'
import { siteUrl } from '@/lib/env'
import { profileNames } from '@/features/classroom/server'
import { GuestLinks, type GuestLinkView } from '@/components/classroom/guest-ui'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.lessons.attendanceTitle }
}

export default async function SessionPage({ params }: { params: Promise<{ ws: string; sessionId: string }> }) {
  const { ws, sessionId } = await params
  const profile = await requireUser({ next: `/teach/${ws}/sessions/${sessionId}` })
  const admin = createAdminSupabase()
  const m = await requireStaffMembership(admin, profile.id, ws)
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const L = c.teach.lessons
  const data = await loadSessionForTeacher(admin, m, profile.id, sessionId)
  const tz = profile.timezone || m.workspace.timezone
  const s = data.session
  const [{ data: linkRows }, { data: guestRows }] = await Promise.all([
    admin.from('class_session_guest_links').select('id, code, role, uses, max_uses, revoked_at').eq('session_id', s.id).order('created_at', { ascending: false }),
    admin.from('class_session_guests').select('user_id, role').eq('session_id', s.id),
  ])
  const guestNames = await profileNames(admin, (guestRows ?? []).map((g) => g.user_id))
  const links: GuestLinkView[] = (linkRows ?? []).map((l) => ({
    id: l.id,
    code: l.code,
    link: siteUrl(`/live/guest/${l.code}`),
    role: l.role as GuestLinkView['role'],
    uses: l.uses,
    maxUses: l.max_uses,
    revoked: !!l.revoked_at,
  }))
  const guests = (guestRows ?? []).map((g) => ({ name: guestNames.get(g.user_id)?.name ?? '—', role: g.role as GuestLinkView['role'] }))
  return (
    <>
      <PageHeader
        title={s.title}
        description={[
          formatDate(s.startsAt, locale, tz, { dateStyle: 'full', timeStyle: 'short' }),
          format(L.minutes, { n: s.durationMinutes }),
          s.location,
          data.group.name,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Link href={`/teach/${ws}/groups/${data.group.id}`} className="text-sm font-medium text-primary hover:underline">
            {data.group.name}
          </Link>
        }
      />
      <Section title={L.attendanceTitle}>
        <Card className="p-5">
          {s.status === 'cancelled' ? (
            <p className="text-sm text-muted-foreground">{L.statuses.cancelled}</p>
          ) : (
            <AttendanceForm
              workspaceId={ws}
              sessionId={s.id}
              students={data.students.map((st) => ({
                ...st,
                joinedLabel: st.joinedAt ? format(L.joinedOnline, { time: formatDate(st.joinedAt, locale, tz, { hour: '2-digit', minute: '2-digit' }) }) : null,
              }))}
            />
          )}
        </Card>
      </Section>
      {s.status !== 'cancelled' && (
        <Section title={c.teach.guests.title} description={c.teach.guests.description}>
          <Card className="p-5">
            <GuestLinks workspaceId={ws} sessionId={s.id} links={links} guests={guests} />
          </Card>
        </Section>
      )}
    </>
  )
}
