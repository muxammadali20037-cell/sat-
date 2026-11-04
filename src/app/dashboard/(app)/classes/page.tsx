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
import { formatDate, percent } from '@/features/dashboard/format'
import { loadMyLessons } from '@/features/classroom/lesson-server'
import { sessionTiming } from '@/features/classroom/lessons'
import { MaterialOpenButton } from '@/components/classroom/lesson-forms'
import { liveConfig } from '@/features/live/server'
import { loadStudentPolls } from '@/features/classroom/poll-server'
import { StudentPollCard } from '@/components/classroom/poll-forms'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).classes.metaTitle }
}

const statusVariant = { not_started: 'neutral', started: 'warning', submitted: 'primary', graded: 'success', closed: 'neutral' } as const

export default async function ClassesPage() {
  const profile = await requireStudentReady({ next: '/dashboard/classes' })
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const t = c.classes
  const admin = createAdminSupabase()
  const { workspaces } = await loadMyClasses(admin, profile.id)
  const tz = profile.timezone || 'Asia/Tashkent'
  const pollsBy = new Map(await Promise.all(workspaces.map(async (w) => [w.workspace.id, await loadStudentPolls(admin, profile.id, w.groups.map((g) => g.id), { limit: 8 })] as const)))
  const lessonsBy = new Map(await Promise.all(workspaces.map(async (w) => [w.workspace.id, await loadMyLessons(admin, profile.id, w.groups)] as const)))
  const now = new Date()
  const liveOn = liveConfig() !== null
  const when = (iso: string) => formatDate(iso, locale, tz, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

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
                {(() => {
                  const ls = lessonsBy.get(w.workspace.id)!
                  const ps = pollsBy.get(w.workspace.id) ?? []
                  return (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {ps.length > 0 && (
                        <div className="space-y-3 lg:col-span-2" data-testid="my-polls">
                          <h3 className="text-[15px] font-semibold">{t.pollsTitle}</h3>
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {ps.map((p) => (
                              <StudentPollCard key={p.id} poll={p} />
                            ))}
                          </div>
                        </div>
                      )}
                      <Card className="p-4" data-testid="my-lessons">
                        <h3 className="text-[15px] font-semibold">{t.lessonsTitle}</h3>
                        {ls.attendance.counted > 0 && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{format(t.myAttendance, { rate: percent(ls.attendance.rate), n: ls.attendance.counted })}</p>
                        )}
                        {ls.sessions.length === 0 ? (
                          <p className="mt-2 text-[13px] text-muted-foreground">{t.noLessons}</p>
                        ) : (
                          <ul className="mt-2 divide-y divide-border">
                            {ls.sessions.slice(0, 6).map((x) => {
                              const timing = sessionTiming(x.startsAt, x.durationMinutes, now)
                              return (
                                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                                  <div className="min-w-0">
                                    <p className={`text-sm font-medium ${x.status === 'cancelled' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{x.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {when(x.startsAt)} · {format(t.minutes, { n: x.durationMinutes })} · {x.groupName}
                                      {x.location && ` · ${x.location}`}
                                    </p>
                                  </div>
                                  {x.status === 'cancelled' ? (
                                    <Badge variant="neutral">{t.lessonCancelled}</Badge>
                                  ) : timing === 'live' ? (
                                    <span className="flex items-center gap-2">
                                      <Badge variant="success">{t.live}</Badge>
                                      {liveOn && (
                                        <Button asChild size="sm">
                                          <Link href={`/live/${x.id}`}>{t.liveRoom}</Link>
                                        </Button>
                                      )}
                                      {x.meetingUrl && (
                                        <Button asChild size="sm">
                                          <a href={x.meetingUrl} target="_blank" rel="noopener noreferrer">
                                            {t.joinLesson}
                                          </a>
                                        </Button>
                                      )}
                                    </span>
                                  ) : null}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </Card>
                      <Card className="p-4" data-testid="my-materials">
                        <h3 className="text-[15px] font-semibold">{t.materialsTitle}</h3>
                        {ls.materials.length === 0 ? (
                          <p className="mt-2 text-[13px] text-muted-foreground">{t.noMaterials}</p>
                        ) : (
                          <ul className="mt-2 divide-y divide-border">
                            {ls.materials.slice(0, 12).map((x) => (
                              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-foreground">{x.title}</p>
                                  <p className="text-xs text-muted-foreground">{x.groupName}</p>
                                </div>
                                <MaterialOpenButton materialId={x.id} kind={x.kind} url={x.url} label={x.kind === 'file' ? t.download : t.openLink} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </Card>
                    </div>
                  )
                })()}
                {w.assignments.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">{t.noAssignments}</p>
                ) : (
                  <Card className="p-0">
                    <ul className="divide-y divide-border">
                      {w.assignments.map((a) => (
                        <li key={a.id}>
                          <Link href={`/dashboard/classes/${a.id}`} className="group flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                                {a.title}
                                {a.personal && (
                                  <Badge variant="primary" className="ml-2 align-middle">
                                    {c.classes.personal}
                                  </Badge>
                                )}
                              </p>
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
