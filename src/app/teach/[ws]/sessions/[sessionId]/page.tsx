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
            <AttendanceForm workspaceId={ws} sessionId={s.id} students={data.students} />
          )}
        </Card>
      </Section>
    </>
  )
}
