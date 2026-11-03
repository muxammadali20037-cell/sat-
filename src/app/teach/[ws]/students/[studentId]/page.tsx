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
import { getTaxonomy } from '@/features/taxonomy/server'
import { can } from '@/features/classroom/permissions'
import { CreateAssignmentForm, type AssignmentPreset } from '@/components/classroom/forms'
import { WEAK_DOMAIN_MAX_ACCURACY, WEAK_DOMAIN_MIN_ANSWERS } from '@/features/intelligence/engine'

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
  const [data, taxonomy, mocks] = await Promise.all([
    loadStudentForTeacher(admin, m, profile.id, studentId),
    getTaxonomy(admin),
    admin.from('mock_exams').select('id, title').eq('status', 'published').order('created_at'),
  ])
  // data.groups holds only groups this staff member teaches, so assigning there is allowed.
  const canAssign = data.groups.length > 0 && can(m.role, 'assignment.create', { teachesGroup: true })
  // Suggest the weakest domain only from practice the student chose to share (same thresholds as
  // the student's own Learning Intelligence).
  const weakest = data.learning?.domains
    .filter((d) => d.answered >= WEAK_DOMAIN_MIN_ANSWERS && d.accuracy !== null && d.accuracy < WEAK_DOMAIN_MAX_ACCURACY)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || b.answered - a.answered)[0]
  const preset: AssignmentPreset | undefined = weakest
    ? {
        title: format(c.teach.student.suggestTitle, { domain: weakest.name }).slice(0, 120),
        instructions: format(c.teach.student.suggestInstructions, { domain: weakest.name }),
        subjectCode: weakest.subjectCode === 'reading_writing' ? 'reading_writing' : 'math',
        domainId: weakest.id,
        difficulty: 'mixed',
      }
    : undefined
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
                        <p className="truncate text-sm font-medium text-foreground">
                          {w.title}
                          {w.personal && (
                            <Badge variant="neutral" className="ml-2 align-middle">
                              {format(c.teach.assignment.forStudent, { name: data.student.name })}
                            </Badge>
                          )}
                        </p>
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

        {canAssign && (
          <Section title={t.personalTitle} description={t.personalBody}>
            <Card className="p-5" data-testid="personal-assignment">
              {data.learning && (
                <p className="mb-4 rounded-md bg-muted/50 px-3 py-2 text-[13px] text-foreground">
                  {weakest
                    ? format(t.suggestion, { domain: weakest.name, accuracy: percent(weakest.accuracy), n: weakest.answered })
                    : format(t.noSuggestion, { n: WEAK_DOMAIN_MIN_ANSWERS, accuracy: percent(WEAK_DOMAIN_MAX_ACCURACY) })}
                </p>
              )}
              <CreateAssignmentForm
                workspaceId={ws}
                groupId={data.groups[0]!.id}
                groups={data.groups}
                assigneeId={data.student.id}
                preset={preset}
                options={{
                  domains: taxonomy.domains.map((d) => ({ id: d.id, name: d.name, subjectCode: (taxonomy.subjectById.get(d.subjectId)?.code ?? 'math') as 'math' | 'reading_writing' })),
                  mockExams: mocks.data ?? [],
                }}
              />
            </Card>
          </Section>
        )}

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
