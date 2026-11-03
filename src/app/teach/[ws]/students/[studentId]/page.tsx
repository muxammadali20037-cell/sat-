import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { loadStudentForTeacher, requireStaffMembership } from '@/features/classroom/server'
import { formatDate, percent } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.metaTitle }
}

export default async function StudentPage({ params }: { params: Promise<{ ws: string; studentId: string }> }) {
  const { ws, studentId } = await params
  const profile = await requireUser({ next: `/teach/${ws}/students/${studentId}` })
  const admin = createAdminSupabase()
  const m = await requireStaffMembership(admin, profile.id, ws)
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const t = c.teach.student
  const data = await loadStudentForTeacher(admin, m, profile.id, studentId)
  const tz = profile.timezone || m.workspace.timezone
  const date = (iso: string) => formatDate(iso, locale, tz, { dateStyle: 'medium' })

  return (
    <>
      <PageHeader title={data.student.name} description={[data.student.email, `${t.groups}: ${data.groups.map((g) => g.name).join(', ')}`].filter(Boolean).join(' · ')} />
      <div className="space-y-10">
        <Section title={t.work}>
          {data.work.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{c.teach.assignment.empty}</p>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {data.work.map((w) => (
                  <li key={w.id}>
                    <Link href={`/teach/${ws}/assignments/${w.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{w.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.kinds[w.kind as keyof typeof c.kinds]} · {w.dueAt ? format(c.due, { date: date(w.dueAt) }) : c.noDue}
                        </p>
                      </div>
                      <span className="flex items-center gap-2 text-xs">
                        <Badge variant={w.status === 'graded' ? 'success' : w.status === 'submitted' ? 'primary' : 'neutral'}>
                          {c.statuses[w.status as keyof typeof c.statuses] ?? w.status}
                        </Badge>
                        {w.score !== null && (
                          <span className="font-medium tabular">{w.points ? format(c.scoreOf, { score: w.score, points: w.points }) : format(c.percent, { score: w.score })}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>

        <Section title={t.learningTitle}>
          {!data.learning ? (
            <p className="max-w-2xl text-[13px] text-muted-foreground">{t.notShared}</p>
          ) : (
            <Card className="space-y-5 p-5">
              <p className="text-sm text-foreground">
                {data.learning.latestEstimate ? format(t.estimate, { low: data.learning.latestEstimate.low, high: data.learning.latestEstimate.high }) : t.noEstimate}
                {data.learning.lastActiveAt && <span className="text-muted-foreground"> · {format(t.lastActive, { date: date(data.learning.lastActiveAt) })}</span>}
              </p>
              <div>
                <h3 className="mb-3 text-sm font-semibold">{t.domainsTitle}</h3>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.learning.domains.map((d) => (
                    <li key={d.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                        <span className="truncate text-foreground">{d.name}</span>
                        <span className="shrink-0 text-muted-foreground tabular">{d.answered > 0 ? `${percent(d.accuracy)} · ${plural(d.answered, t.answers)}` : '—'}</span>
                      </div>
                      <ProgressBar value={(d.accuracy ?? 0) * 100} label={d.name} size="sm" />
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">{c.teach.assignment.estimateNote}</p>
            </Card>
          )}
        </Section>
      </div>
    </>
  )
}
