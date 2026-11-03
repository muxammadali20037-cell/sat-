import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CloseAssignmentButton, GradeForm } from '@/components/classroom/forms'
import { loadAssignmentForTeacher, requireStaffMembership } from '@/features/classroom/server'
import { formatDate } from '@/features/dashboard/format'
import type { PracticeConfig } from '@/features/classroom/schemas'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).teach.metaTitle }
}

const statusVariant = { not_started: 'neutral', started: 'warning', submitted: 'primary', graded: 'success' } as const

export default async function AssignmentPage({ params }: { params: Promise<{ ws: string; assignmentId: string }> }) {
  const { ws, assignmentId } = await params
  const profile = await requireUser({ next: `/teach/${ws}/assignments/${assignmentId}` })
  const admin = createAdminSupabase()
  const m = await requireStaffMembership(admin, profile.id, ws)
  const [c, p, locale] = await Promise.all([getDict(classroomDict), getDict(practiceDict), getLocale()])
  const t = c.teach.assignment
  const { assignment: a, group, rows } = await loadAssignmentForTeacher(admin, m, profile.id, assignmentId)
  const tz = profile.timezone || m.workspace.timezone
  const date = (iso: string) => formatDate(iso, locale, tz, { dateStyle: 'medium', timeStyle: 'short' })
  const cfg = a.kind === 'practice' ? (a.practice_config as PracticeConfig) : null
  const scoreText = (score: number | null) => (score === null ? '—' : a.points ? format(c.scoreOf, { score, points: a.points }) : format(c.percent, { score }))

  return (
    <>
      <PageHeader
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={`/teach/${ws}/groups/${group.id}`}>
              <ChevronLeft aria-hidden /> {group.name}
            </Link>
          </Button>
        }
        title={a.title}
        description={[
          c.kinds[a.kind],
          cfg ? format(t.practiceSummary, { count: cfg.count, difficulty: p.difficulty[cfg.difficulty] }) + (cfg.timed ? ` · ${t.timedTag}` : '') : null,
          a.due_at ? format(c.due, { date: date(a.due_at) }) : c.noDue,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={a.status !== 'closed' ? <CloseAssignmentButton workspaceId={ws} assignmentId={a.id} /> : <Badge variant="neutral">{c.statuses.closed}</Badge>}
      />
      {a.instructions && <p className="mb-8 max-w-2xl whitespace-pre-line text-sm text-foreground">{a.instructions}</p>}

      <Section title={t.submissionsTitle} description={a.kind === 'mock_exam' ? t.estimateNote : undefined}>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t.noStudents}</p>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.studentId} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/teach/${ws}/students/${r.studentId}`} className="min-w-0 text-sm font-medium text-foreground hover:text-primary hover:underline">
                      {r.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {r.submittedAt && <span>{date(r.submittedAt)}</span>}
                      {r.late && <Badge variant="warning">{c.late}</Badge>}
                      <Badge variant={statusVariant[r.status]}>{c.statuses[r.status]}</Badge>
                      <span className="font-medium text-foreground tabular">
                        {r.estimate ? format(t.estimate, { low: r.estimate.low, high: r.estimate.high }) : scoreText(r.score)}
                      </span>
                    </div>
                  </div>
                  {a.kind === 'text' && r.textAnswer && (
                    <div className="rounded-md bg-muted px-3 py-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{t.answer}</p>
                      <p className="whitespace-pre-line text-sm text-foreground">{r.textAnswer}</p>
                    </div>
                  )}
                  {a.kind === 'text' && (r.status === 'submitted' || r.status === 'graded') && (
                    <GradeForm workspaceId={ws} assignmentId={a.id} studentId={r.studentId} max={a.points ?? 100} initial={{ score: r.score, feedback: r.feedback }} />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>
    </>
  )
}
