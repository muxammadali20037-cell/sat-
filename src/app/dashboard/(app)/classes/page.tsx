import type { Metadata } from 'next'
import Link from 'next/link'
import { School } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { JoinForm, SharingToggle } from '@/components/classroom/forms'
import { loadMyClasses } from '@/features/classroom/server'
import { formatDate } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).classes.metaTitle }
}

const statusVariant = { not_started: 'neutral', started: 'warning', submitted: 'primary', graded: 'success', closed: 'neutral' } as const

export default async function ClassesPage() {
  const profile = await requireStudentReady({ next: '/dashboard/classes' })
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const t = c.classes
  const { workspaces } = await loadMyClasses(createAdminSupabase(), profile.id)
  const tz = profile.timezone || 'Asia/Tashkent'

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className="space-y-10">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-foreground">{t.joinTitle}</h2>
          <p className="mb-4 mt-0.5 text-[13px] text-muted-foreground">{t.joinBody}</p>
          <JoinForm />
        </Card>

        {workspaces.length === 0 ? (
          <EmptyState icon={<School />} title={t.emptyTitle} description={t.emptyBody} />
        ) : (
          workspaces.map((w) => (
            <Section
              key={w.workspace.id}
              title={w.workspace.name}
              description={[w.teachers.length ? format(t.teachers, { names: w.teachers.join(', ') }) : null, w.groups.length ? format(t.groups, { names: w.groups.map((g) => g.name).join(', ') }) : null]
                .filter(Boolean)
                .join(' · ')}
            >
              <div className="space-y-4">
                <Card className="p-4">
                  <SharingToggle workspaceId={w.workspace.id} enabled={w.sharing} />
                </Card>
                {w.assignments.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">{t.noAssignments}</p>
                ) : (
                  <Card className="p-0">
                    <ul className="divide-y divide-border">
                      {w.assignments.map((a) => (
                        <li key={a.id}>
                          <Link href={`/dashboard/classes/${a.id}`} className="group flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">{a.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {c.kinds[a.kind]} · {a.groupName} · {a.dueAt ? format(c.due, { date: formatDate(a.dueAt, locale, tz, { dateStyle: 'medium', timeStyle: 'short' }) }) : c.noDue}
                              </p>
                            </div>
                            <span className="flex items-center gap-2 text-xs">
                              {a.score !== null && <span className="font-medium tabular">{a.points ? format(c.scoreOf, { score: a.score, points: a.points }) : format(c.percent, { score: a.score })}</span>}
                              <Badge variant={statusVariant[a.status]}>{c.statuses[a.status]}</Badge>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            </Section>
          ))
        )}

        <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t.teacherTitle}</h2>
            <p className="text-[13px] text-muted-foreground">{t.teacherBody}</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/teach">{t.teacherCta}</Link>
          </Button>
        </Card>
      </div>
    </>
  )
}
