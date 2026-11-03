import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { PageHeader } from '@/components/layout/page-header'
import { Alert, Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StartAssignmentButton, TextSubmissionForm } from '@/components/classroom/forms'
import { loadMyAssignment } from '@/features/classroom/server'
import { formatDate } from '@/features/dashboard/format'
import type { PracticeConfig } from '@/features/classroom/schemas'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDict(classroomDict)).classes.metaTitle }
}

export default async function MyAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const profile = await requireStudentReady({ next: `/dashboard/classes/${assignmentId}` })
  const [c, p, locale] = await Promise.all([getDict(classroomDict), getDict(practiceDict), getLocale()])
  const t = c.classes
  const admin = createAdminSupabase()
  const data = await loadMyAssignment(admin, profile.id, assignmentId)
  const a = data.assignment
  const sub = data.submission
  const tz = profile.timezone || 'Asia/Tashkent'
  const date = (iso: string) => formatDate(iso, locale, tz, { dateStyle: 'medium', timeStyle: 'short' })
  const closed = a.status === 'closed'
  const cfg = a.kind === 'practice' ? (a.practice_config as PracticeConfig) : null

  let attemptStatus: string | null = null
  if (sub?.attempt_id) {
    const { data: at } = await admin.from('attempts').select('status').eq('id', sub.attempt_id).eq('user_id', profile.id).maybeSingle()
    attemptStatus = at?.status ?? null
  }
  const score = sub?.score === null || sub?.score === undefined ? null : Number(sub.score)

  return (
    <>
      <PageHeader
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/dashboard/classes">
              <ChevronLeft aria-hidden /> {t.back}
            </Link>
          </Button>
        }
        title={a.title}
        description={[data.workspace.name, data.groupName, c.kinds[a.kind], a.due_at ? format(c.due, { date: date(a.due_at) }) : c.noDue].join(' · ')}
      />
      <div className="max-w-3xl space-y-5">
        {a.instructions && (
          <Card className="p-5">
            <h2 className="mb-1 text-sm font-semibold">{t.instructions}</h2>
            <p className="whitespace-pre-line text-sm text-foreground">{a.instructions}</p>
          </Card>
        )}
        {cfg && (
          <p className="text-[13px] text-muted-foreground">
            {format(c.teach.assignment.practiceSummary, { count: cfg.count, difficulty: p.difficulty[cfg.difficulty] })}
            {cfg.timed ? ` · ${c.teach.assignment.timedTag}` : ''}
          </p>
        )}

        {sub?.status === 'graded' && (
          <Card className="space-y-1 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Badge variant="success">{t.graded}</Badge>
              {score !== null && (a.points ? format(c.scoreOf, { score, points: a.points }) : format(c.percent, { score }))}
            </p>
            {sub.feedback && (
              <p className="whitespace-pre-line text-sm text-foreground">
                <span className="font-medium">{t.feedback}: </span>
                {sub.feedback}
              </p>
            )}
          </Card>
        )}

        {a.kind === 'practice' &&
          (sub && sub.status !== 'started' ? (
            <Alert variant="success">
              {t.practiceDone}
              {score !== null && ` ${format(c.percent, { score: a.points ? Math.round((score / a.points) * 100) : score })}`}{' '}
              {sub.attempt_id && (
                <Link href={`/dashboard/results/${sub.attempt_id}`} className="font-medium underline">
                  {t.viewResults}
                </Link>
              )}
            </Alert>
          ) : closed ? (
            <Alert variant="neutral">{t.closedNote}</Alert>
          ) : (
            <StartAssignmentButton assignmentId={a.id} label={attemptStatus === 'in_progress' ? t.continuePractice : t.startPractice} />
          ))}

        {a.kind === 'mock_exam' &&
          (data.mock ? (
            <Alert variant="success">{t.mockDone}</Alert>
          ) : closed ? (
            <Alert variant="neutral">{t.closedNote}</Alert>
          ) : data.mockExam ? (
            <Button asChild>
              <Link href={`/dashboard/mock-exams/${data.mockExam.id}`}>{t.startMock}</Link>
            </Button>
          ) : null)}

        {a.kind === 'text' && (
          <Card className="p-5">
            {closed && sub?.status !== 'graded' && <p className="mb-3 text-[13px] text-muted-foreground">{t.closedNote}</p>}
            <TextSubmissionForm assignmentId={a.id} initial={sub?.text_answer ?? ''} disabled={closed || sub?.status === 'graded'} />
          </Card>
        )}
      </div>
    </>
  )
}
