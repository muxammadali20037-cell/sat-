import type { Metadata } from 'next'
import Link from 'next/link'
import QRCode from 'qrcode'
import { UsersRound } from 'lucide-react'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { siteUrl } from '@/lib/env'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { ArchiveGroupButton, CreateAssignmentForm, CreateInvitationForm, InvitationList, RemoveStudentButton, type InvitationView } from '@/components/classroom/forms'
import { loadGroup, requireStaffMembership } from '@/features/classroom/server'
import { can } from '@/features/classroom/permissions'
import { getTaxonomy } from '@/features/taxonomy/server'
import { formatDate, percent } from '@/features/dashboard/format'
import { loadGroupLessons } from '@/features/classroom/lesson-server'
import { sessionTiming } from '@/features/classroom/lessons'
import {
  AddLinkMaterialForm,
  ArchiveMaterialButton,
  CancelSessionButton,
  CreateSessionForm,
  MaterialOpenButton,
  UploadMaterialForm,
} from '@/components/classroom/lesson-forms'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.metaTitle }
}

export default async function GroupPage({ params }: { params: Promise<{ ws: string; groupId: string }> }) {
  const { ws, groupId } = await params
  const profile = await requireUser({ next: `/teach/${ws}/groups/${groupId}` })
  const admin = createAdminSupabase()
  const m = await requireStaffMembership(admin, profile.id, ws)
  const [c, locale] = await Promise.all([getDict(classroomDict), getLocale()])
  const t = c.teach
  const data = await loadGroup(admin, m, profile.id, groupId)
  const tz = profile.timezone || m.workspace.timezone
  const date = (iso: string) => formatDate(iso, locale, tz, { dateStyle: 'medium' })

  const [taxonomy, mocks, lessons] = await Promise.all([
    getTaxonomy(admin),
    admin.from('mock_exams').select('id, title').eq('status', 'published').order('created_at'),
    loadGroupLessons(admin, groupId),
  ])
  const now = new Date()
  const when = (iso: string) => formatDate(iso, locale, tz, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const upcoming = lessons.sessions.filter((x) => sessionTiming(x.startsAt, x.durationMinutes, now) !== 'ended')
  const past = lessons.sessions.filter((x) => sessionTiming(x.startsAt, x.durationMinutes, now) === 'ended').reverse().slice(0, 10)
  const a = lessons.analytics
  const L = t.lessons
  const M = t.materials
  const invitations: InvitationView[] = await Promise.all(
    data.invitations.map(async (i) => {
      const link = siteUrl(`/join/${i.code}`)
      return { ...i, link, qr: await QRCode.toDataURL(link, { margin: 1, width: 224 }), expires: date(i.expiresAt) }
    }),
  )
  const teaches = true // loadGroup already enforced that this member teaches the group
  const kindLabel = (k: 'practice' | 'mock_exam' | 'text') => c.kinds[k]

  return (
    <>
      <PageHeader
        title={data.group.name}
        description={[data.group.subject, plural(data.students.length, c.students)].filter(Boolean).join(' · ')}
        actions={can(m.role, 'group.archive', { teachesGroup: teaches }) ? <ArchiveGroupButton workspaceId={ws} groupId={groupId} /> : undefined}
      />
      <div className="space-y-10">
        <section aria-label={t.analytics.title} className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="group-analytics">
          {[
            { label: t.analytics.students, value: String(a.students), hint: null },
            {
              label: t.analytics.attendance,
              value: a.attendance.rate === null ? t.analytics.none : percent(a.attendance.rate),
              hint: a.attendance.rate === null ? null : format(t.analytics.attendanceHint, { n: a.attendance.present + a.attendance.late + a.attendance.absent }),
            },
            {
              label: t.analytics.completion,
              value: a.completion.rate === null ? t.analytics.none : percent(a.completion.rate),
              hint: a.completion.rate === null ? null : format(t.analytics.completionHint, { done: a.completion.done, total: a.completion.expected }),
            },
            {
              label: t.analytics.avgScore,
              value: a.averageScore.value === null ? t.analytics.none : percent(a.averageScore.value),
              hint: a.averageScore.value === null ? null : format(t.analytics.avgScoreHint, { n: a.averageScore.count }),
            },
          ].map((x) => (
            <Card key={x.label} className="p-4">
              <p className="text-[13px] text-muted-foreground">{x.label}</p>
              <p className="mt-1 text-xl font-semibold tabular text-foreground">{x.value}</p>
              {x.hint && <p className="mt-0.5 text-xs text-muted-foreground">{x.hint}</p>}
            </Card>
          ))}
        </section>

        <Section title={L.title} description={L.description}>
          <div className="space-y-4">
            {lessons.sessions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{L.empty}</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {[...upcoming, ...past].map((x) => {
                    const timing = sessionTiming(x.startsAt, x.durationMinutes, now)
                    return (
                      <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-session={x.id}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">
                            {x.title}
                            {timing === 'ended' && <span className="ml-2 text-xs font-normal text-muted-foreground">{L.past}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {when(x.startsAt)} · {format(L.minutes, { n: x.durationMinutes })}
                            {x.location && ` · ${x.location}`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant={x.status === 'cancelled' ? 'neutral' : timing === 'live' ? 'success' : x.status === 'completed' ? 'primary' : 'neutral'}>
                            {x.status === 'scheduled' && timing === 'live' ? L.statuses.live : L.statuses[x.status]}
                          </Badge>
                          {x.status !== 'cancelled' && (
                            <Link href={`/teach/${ws}/sessions/${x.id}`} className="font-medium text-primary hover:underline">
                              {L.mark} · {format(L.attendanceOf, { marked: x.marked, total: data.students.length })}
                            </Link>
                          )}
                          {x.meetingUrl && x.status !== 'cancelled' && timing !== 'ended' && (
                            <a href={x.meetingUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                              {L.join}
                            </a>
                          )}
                          {x.status === 'scheduled' && timing !== 'ended' && <CancelSessionButton workspaceId={ws} sessionId={x.id} />}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )}
            <Card className="p-5">
              <h3 className="mb-4 text-[15px] font-semibold">{L.newTitle}</h3>
              <CreateSessionForm workspaceId={ws} groupId={groupId} />
            </Card>
          </div>
        </Section>

        <Section title={M.title} description={M.description}>
          <div className="space-y-4">
            {lessons.materials.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{M.empty}</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {lessons.materials.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-material={x.id}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{x.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {x.kind === 'file' ? `${x.fileName ?? ''} · ${Math.max(1, Math.round((x.sizeBytes ?? 0) / 1024))} KB` : x.url}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MaterialOpenButton materialId={x.id} kind={x.kind} url={x.url} label={x.kind === 'file' ? M.download : M.open} />
                        <ArchiveMaterialButton materialId={x.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card className="space-y-5 p-5">
              <div>
                <h3 className="mb-3 text-[15px] font-semibold">{M.addFile}</h3>
                <UploadMaterialForm workspaceId={ws} groupId={groupId} />
              </div>
              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-[15px] font-semibold">{M.addLink}</h3>
                <AddLinkMaterialForm workspaceId={ws} groupId={groupId} />
              </div>
            </Card>
          </div>
        </Section>

        <Section title={t.group.studentsTitle}>
          {data.students.length === 0 ? (
            <EmptyState icon={<UsersRound />} title={t.group.noStudentsTitle} description={t.group.noStudentsBody} />
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {data.students.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <Link href={`/teach/${ws}/students/${s.id}`} className="min-w-0 flex-1 group">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-primary group-hover:underline">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[s.email, format(t.group.joined, { date: date(s.joinedAt) }), format(t.group.submittedCount, { n: s.done })].filter(Boolean).join(' · ')}
                      </p>
                    </Link>
                    <Badge variant={s.sharing ? 'success' : 'neutral'}>{s.sharing ? t.group.sharing : t.group.notSharing}</Badge>
                    <RemoveStudentButton workspaceId={ws} groupId={groupId} studentId={s.id} name={s.name} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>

        <Section title={t.invite.title} description={t.invite.description}>
          <div className="space-y-4">
            <Card className="p-5">
              <CreateInvitationForm workspaceId={ws} groupId={groupId} roles={['student']} />
            </Card>
            <InvitationList workspaceId={ws} items={invitations} />
          </div>
        </Section>

        <Section title={t.assignment.title}>
          <div className="space-y-4">
            {data.assignments.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t.assignment.empty}</p>
            ) : (
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {data.assignments.map((a) => (
                    <li key={a.id}>
                      <Link href={`/teach/${ws}/assignments/${a.id}`} className="group flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                            {a.title}
                            {a.assignee && (
                              <Badge variant="neutral" className="ml-2 align-middle">
                                {format(t.assignment.forStudent, { name: a.assignee.name })}
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {kindLabel(a.kind)} · {a.dueAt ? format(c.due, { date: date(a.dueAt) }) : c.noDue}
                          </p>
                        </div>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground tabular">
                          {a.submitted}/{a.assignee ? 1 : data.students.length}
                          <Badge variant={a.status === 'closed' ? 'neutral' : 'primary'}>{c.statuses[a.status]}</Badge>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <Card className="p-5">
              <h3 className="mb-4 text-[15px] font-semibold">{t.assignment.newTitle}</h3>
              <CreateAssignmentForm
                workspaceId={ws}
                groupId={groupId}
                options={{
                  domains: taxonomy.domains.map((d) => ({ id: d.id, name: d.name, subjectCode: (taxonomy.subjectById.get(d.subjectId)?.code ?? 'math') as 'math' | 'reading_writing' })),
                  mockExams: mocks.data ?? [],
                }}
              />
            </Card>
          </div>
        </Section>

        {data.staff.length > 0 && (
          <Section title={t.group.staffTitle}>
            <p className="text-sm text-muted-foreground">{data.staff.map((s) => `${s.name} (${c.roles[s.role as keyof typeof c.roles] ?? s.role})`).join(', ')}</p>
          </Section>
        )}
      </div>
    </>
  )
}
