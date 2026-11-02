import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { BookOpen, CalendarCheck, Info } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { resultsDict } from '@/lib/i18n/dictionaries/results'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { formatDuration, formatPercent } from '@/lib/utils'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Alert, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { StatCard } from '@/components/ui/progress'
import { getTaxonomy } from '@/features/taxonomy/server'
import { isUuid } from '@/features/practice/schemas'
import { loadOwnedAttempt } from '@/features/practice/server'
import { buildAttemptReport, lessonsForSkills } from '@/features/results/server'
import { ensureDiagnosticScored, finalizeDiagnostic, getGraceSeconds, isPastDeadline, loadDiagnosticResults } from '@/features/diagnostic/server'
import { StartPracticeButton } from '@/components/practice/start-practice-button'
import { DomainLevels, SkillBreakdown, WeakSkillList } from '@/components/results/breakdowns'
import { ReviewList, type ReviewEntry } from '@/components/results/review-list'

export const metadata: Metadata = { title: 'Results' }

export default async function AttemptResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  if (!isUuid(attemptId)) notFound()
  const profile = await requireStudentReady({ next: `/dashboard/results/${attemptId}` })
  const [t, tp, locale] = await Promise.all([getDict(resultsDict), getDict(practiceDict), getLocale()])
  const admin = createAdminSupabase()

  // Owner-filtered lookup: another student's attempt id is a 404.
  let attempt = await loadOwnedAttempt(admin, profile.id, attemptId)
  if (!attempt) notFound()
  if (attempt.kind === 'mock_exam') redirect(`/dashboard/mock-exams/results/${attempt.id}`)

  const isDiagnostic = attempt.kind === 'diagnostic'
  if (isDiagnostic && attempt.status === 'in_progress' && isPastDeadline(attempt, await getGraceSeconds(admin))) {
    attempt = (await finalizeDiagnostic(admin, profile, attempt.id)) ?? attempt
  }
  if (isDiagnostic && (attempt.status === 'completed' || attempt.status === 'expired')) await ensureDiagnosticScored(admin, attempt)

  const title = isDiagnostic ? t.detail.diagnosticTitle : t.detail.practiceTitle
  const breadcrumb = <Breadcrumb items={[{ label: t.title, href: '/dashboard/results' }, { label: title }]} />
  const dateFormat = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  // A running diagnostic reveals nothing until it is finished.
  if (isDiagnostic && attempt.status === 'in_progress') {
    return (
      <div>
        <PageHeader breadcrumb={breadcrumb} title={title} />
        <Alert
          variant="warning"
          title={t.detail.inProgressDiagnostic}
          action={
            <Button asChild size="sm">
              <Link href={`/dashboard/diagnostic/${attempt.id}`}>{t.detail.resume}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const [report, taxonomy, domainResults] = await Promise.all([
    buildAttemptReport(admin, profile, attempt),
    getTaxonomy(admin),
    isDiagnostic ? loadDiagnosticResults(admin, profile.id, attempt.id) : Promise.resolve([]),
  ])
  const lessons = isDiagnostic ? await lessonsForSkills(admin, report.weakest.map((s) => s.skillId)) : []
  const { summary } = report
  const inProgress = attempt.status === 'in_progress'
  const retryable = !inProgress && (summary.incorrect > 0 || summary.unanswered > 0)

  const practiceHref = (s: { skillId: string; domainId: string }) => {
    const domain = taxonomy.domainById.get(s.domainId)
    const subject = domain ? taxonomy.subjectById.get(domain.subjectId)?.code : undefined
    return `/dashboard/practice?${new URLSearchParams({ ...(subject ? { subject } : {}), domain: s.domainId, skill: s.skillId })}`
  }

  const reviewEntries: ReviewEntry[] = report.items
    .filter((i): i is typeof i & { reveal: NonNullable<typeof i.reveal> } => !!i.reveal)
    .map((i) => ({
      position: i.position,
      question: i.question,
      answered: i.answered,
      markedForReview: i.markedForReview,
      timeSpentSeconds: i.timeSpentSeconds,
      reveal: i.reveal,
    }))
  const avg = summary.answered > 0 && !isDiagnostic ? summary.timeSpentSeconds / summary.answered : null

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb={breadcrumb}
        title={title}
        description={dateFormat.format(new Date(attempt.completed_at ?? attempt.started_at))}
        actions={
          <>
            {retryable && (
              <StartPracticeButton request={{ mode: 'retry', sourceAttemptId: attempt.id }} variant="secondary">
                {t.detail.retry}
              </StartPracticeButton>
            )}
            {!isDiagnostic && (
              <Button asChild variant={retryable ? 'ghost' : 'primary'}>
                <Link href="/dashboard/practice">{t.detail.newSession}</Link>
              </Button>
            )}
          </>
        }
      />

      {isDiagnostic && (
        <Alert variant="neutral" icon={<Info />}>
          {t.detail.disclaimer}
        </Alert>
      )}
      {inProgress && (
        <Alert
          variant="warning"
          title={t.detail.inProgressPractice}
          action={
            <Button asChild size="sm">
              <Link href={`/dashboard/practice/${attempt.id}`}>{t.detail.resume}</Link>
            </Button>
          }
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.detail.accuracy} value={summary.accuracy === null ? null : formatPercent(summary.accuracy)} />
        <StatCard label={t.detail.correct} value={`${summary.correct} / ${isDiagnostic ? summary.total : summary.answered}`} />
        <StatCard
          label={t.detail.answered}
          value={`${summary.answered} / ${summary.total}`}
          hint={summary.unanswered > 0 ? format(t.detail.unanswered, { n: summary.unanswered }) : undefined}
        />
        <StatCard
          label={t.detail.time}
          value={summary.timeSpentSeconds > 0 ? formatDuration(summary.timeSpentSeconds) : null}
          hint={avg !== null ? format(t.detail.avgTime, { time: formatDuration(avg) }) : undefined}
        />
      </div>

      {isDiagnostic && domainResults.length > 0 && (
        <Section title={t.detail.domains} description={t.detail.domainsDescription}>
          <DomainLevels rows={domainResults} levelLabels={t.detail.level} rowLabel={t.detail.skillRow} />
          <p className="text-xs text-muted-foreground">{t.detail.levelHint}</p>
        </Section>
      )}

      {report.skills.length > 0 && (
        <Section title={t.detail.weakest} description={t.detail.weakestDescription}>
          {report.weakest.length === 0 ? (
            <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t.detail.noWeak}</p>
          ) : (
            <WeakSkillList rows={report.weakest} practiseLabel={t.detail.practiseSkill} rowLabel={t.detail.skillRow} hrefFor={practiceHref} />
          )}
        </Section>
      )}

      {isDiagnostic && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Section title={t.detail.lessons} description={t.detail.lessonsDescription}>
            {lessons.length === 0 ? (
              <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{t.detail.noLessons}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                    <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {taxonomy.skillById.get(l.skillId)?.name}
                        {l.durationSeconds > 0 && ` · ${formatDuration(l.durationSeconds)}`}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/dashboard/lesson/${l.id}`}>{t.detail.openLesson}</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Card className="self-start p-5">
            <CalendarCheck className="size-5 text-primary" aria-hidden />
            <p className="mt-2 font-medium">{t.detail.studyPlan}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.detail.studyPlanBody}</p>
            <Button asChild className="mt-4 w-full">
              <Link href="/dashboard/study-plan">{t.detail.studyPlan}</Link>
            </Button>
          </Card>
        </div>
      )}

      {report.skills.length > 0 && (
        <Section title={t.detail.skills} description={t.detail.skillsDescription}>
          <SkillBreakdown rows={report.skills} rowLabel={t.detail.skillRow} />
        </Section>
      )}

      <Section title={t.detail.review} description={isDiagnostic ? t.detail.reviewDescriptionDiagnostic : t.detail.reviewDescriptionPractice}>
        {reviewEntries.length === 0 ? (
          <EmptyState
            title={t.detail.noReview}
            action={
              inProgress ? (
                <Button asChild>
                  <Link href={`/dashboard/practice/${attempt.id}`}>{t.detail.resume}</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/dashboard/practice">{tp.builder.start}</Link>
                </Button>
              )
            }
          />
        ) : (
          <ReviewList entries={reviewEntries} showTime={!isDiagnostic} />
        )}
      </Section>
    </div>
  )
}
