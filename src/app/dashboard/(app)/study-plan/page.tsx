import type { Metadata } from 'next'
import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { studyPlanDict } from '@/lib/i18n/dictionaries/study-plan'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { addDays, daysBetween, localDate } from '@/lib/time'
import { getEntitlements } from '@/features/entitlements/server'
import { getTaxonomy, type Taxonomy } from '@/features/taxonomy/server'
import { loadActivePlan, reconcilePlan, type PlanRow, type TaskRow } from '@/features/study-plan/server'
import { practiceTargetQuestions } from '@/features/study-plan/reconcile'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Alert, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CircularProgress, ProgressBar } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import { PlanGenerateButton, TaskItem, type TaskView } from '@/components/study-plan/plan-actions'
import type { SubjectCode } from '@/types/questions'

export const metadata: Metadata = { title: 'Study plan' }

type T = typeof studyPlanDict.en

function formatDay(date: string, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  try {
    return new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'en-US', { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  } catch {
    return date
  }
}

function toView(task: TaskRow, plan: PlanRow, taxonomy: Taxonomy, t: T): TaskView {
  const skill = task.skill_id ? taxonomy.skillById.get(task.skill_id) : undefined
  const domain = skill ? taxonomy.domainById.get(skill.domainId) : undefined
  const subject = domain ? taxonomy.subjectById.get(domain.subjectId) : undefined
  let title = task.title
  let detail: string | null = null
  let href: string | null = null
  if (task.task_type === 'practice') {
    title = format(t.task.practice, { skill: skill?.name ?? task.title.replace(/^Practice: /, '') })
    detail = format(t.task.practiceDetail, { n: practiceTargetQuestions(task.estimated_minutes) })
    if (skill && domain && subject) {
      href = `/dashboard/practice?${new URLSearchParams({ subject: subject.code, domain: domain.id, skill: skill.id }).toString()}`
    }
  } else if (task.task_type === 'lesson') {
    detail = t.task.lessonDetail
    href = task.lesson_id ? `/dashboard/lesson/${task.lesson_id}` : null
  } else if (task.task_type === 'review') {
    const untilExam = plan.exam_date ? daysBetween(task.scheduled_date, plan.exam_date) : null
    title = untilExam === 1 ? t.task.restReview : untilExam !== null && untilExam <= 3 && untilExam > 0 ? t.task.finalReview : t.task.review
    href = '/dashboard/results'
  } else if (task.task_type === 'mock_exam') {
    href = task.mock_exam_id ? `/dashboard/mock-exams/${task.mock_exam_id}` : '/dashboard/mock-exams'
  }
  return {
    id: task.id,
    date: task.scheduled_date,
    type: task.task_type as TaskView['type'],
    title,
    detail,
    minutes: task.estimated_minutes,
    status: task.status,
    href,
  }
}

export default async function StudyPlanPage() {
  const profile = await requireStudentReady({ next: '/dashboard/study-plan' })
  const [t, locale, entitlements] = await Promise.all([getDict(studyPlanDict), getLocale(), getEntitlements(profile.id)])

  if (!entitlements.features.study_plan.enabled) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <UpgradeNotice title={t.upgradeTitle} description={t.upgradeBody} actionLabel={t.upgradeAction} />
      </>
    )
  }

  const db = await createServerSupabase()
  const [taxonomy, loaded] = await Promise.all([getTaxonomy(db), loadActivePlan(db, profile.id)])
  const today = localDate(profile.timezone)

  if (!loaded) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <EmptyState
          title={t.empty.title}
          description={
            <>
              {format(t.empty.body, {
                exam: profile.examDate ? formatDay(profile.examDate, locale, { day: 'numeric', month: 'long', year: 'numeric' }) : t.empty.noExam,
                minutes: profile.dailyStudyMinutes ?? 60,
              })}{' '}
              {t.empty.tip}
            </>
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <PlanGenerateButton mode="create" />
              <Button asChild variant="secondary">
                <Link href="/dashboard/diagnostic">{t.empty.diagnosticLink}</Link>
              </Button>
            </div>
          }
        />
      </>
    )
  }

  const { plan } = loaded
  let tasks = loaded.tasks
  // Reconcile with real progress (lessons finished, questions answered) before rendering.
  const completedIds = await reconcilePlan(createAdminSupabase(), profile, plan, tasks).catch((err) => {
    console.error('[study-plan] reconciliation failed', err)
    return [] as string[]
  })
  if (completedIds.length > 0) {
    const done = new Set(completedIds)
    tasks = tasks.map((task) => (done.has(task.id) ? { ...task, status: 'completed' as const } : task))
  }

  const views = tasks.map((task) => toView(task, plan, taxonomy, t))
  const todayTasks = views.filter((v) => v.date === today)
  const overdue = views.filter((v) => v.date < today && v.status === 'pending')
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((date) => ({ date, tasks: views.filter((v) => v.date === date) }))

  const total = views.length
  const completed = views.filter((v) => v.status === 'completed').length
  const skipped = views.filter((v) => v.status === 'skipped').length
  const remaining = total - completed - skipped
  const totalMinutes = views.reduce((s, v) => s + v.minutes, 0)
  const doneMinutes = views.filter((v) => v.status === 'completed').reduce((s, v) => s + v.minutes, 0)
  const overallPct = total > 0 ? Math.round((completed / total) * 100) : 0

  // Subject split (planned minutes).
  const bySubject: Record<SubjectCode, number> = { math: 0, reading_writing: 0 }
  const practiceByDomain = new Map<string, number>()
  for (const task of tasks) {
    const code = task.subject_id ? taxonomy.subjectById.get(task.subject_id)?.code : undefined
    if (code) bySubject[code] += task.estimated_minutes
    if (task.task_type === 'practice' && task.domain_id) {
      practiceByDomain.set(task.domain_id, (practiceByDomain.get(task.domain_id) ?? 0) + task.estimated_minutes)
    }
  }
  const subjectTotal = bySubject.math + bySubject.reading_writing
  const subjects = (Object.keys(bySubject) as SubjectCode[]).sort((a, b) => bySubject[b] - bySubject[a])
  const topDomains = [...practiceByDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => taxonomy.domainById.get(id)?.name)
    .filter(Boolean)
    .join(', ')
  const mockCount = tasks.filter((x) => x.task_type === 'mock_exam').length
  const hasLightReview = Boolean(plan.exam_date && tasks.some((x) => x.task_type === 'review' && daysBetween(x.scheduled_date, plan.exam_date!) <= 3))
  const examPassed = Boolean(profile.examDate && profile.examDate <= today)
  const planDays = daysBetween(plan.start_date, plan.end_date) + 1

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/settings">
                <Settings2 aria-hidden /> {t.actions.changeSettings}
              </Link>
            </Button>
            <PlanGenerateButton mode="regenerate" />
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="tabular">{format(t.meta.period, { start: formatDay(plan.start_date, locale), end: formatDay(plan.end_date, locale) })}</span>
        {plan.exam_date ? (
          <span>
            {t.meta.examDate}: <span className="font-medium text-foreground">{formatDay(plan.exam_date, locale, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </span>
        ) : (
          <span>{format(t.meta.noExamDate, { days: planDays })}</span>
        )}
        <span>{format(t.meta.daily, { minutes: plan.daily_minutes })}</span>
        {plan.target_score && (
          <span>
            {t.meta.target}: <span className="font-medium text-foreground tabular">{plan.target_score}</span>
          </span>
        )}
        <span>{plan.generated_by === 'rules_ai' ? t.meta.generatedAi : t.meta.generatedRules}</span>
      </div>

      {examPassed && <Alert variant="warning" className="mb-6" title={t.meta.examPassed} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title={t.today.title} description={formatDay(today, locale, { weekday: 'long', day: 'numeric', month: 'long' })}>
            <Card>
              <CardContent className="pt-2">
                {todayTasks.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">{t.today.empty}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {todayTasks.map((task) => (
                      <TaskItem key={task.id} task={task} />
                    ))}
                  </ul>
                )}
                {todayTasks.length > 0 && todayTasks.every((x) => x.status !== 'pending') && (
                  <p className="border-t border-border py-3 text-sm font-medium text-success">{t.today.allDone}</p>
                )}
              </CardContent>
            </Card>
            {overdue.length > 0 && (
              <details className="rounded-lg border border-border bg-card px-5 py-3">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  {overdue.length === 1 ? t.today.overdueOne : format(t.today.overdue, { n: overdue.length })}{' '}
                  <span className="text-muted-foreground">· {t.today.showOverdue}</span>
                </summary>
                <ul className="mt-2 divide-y divide-border">
                  {overdue.slice(0, 10).map((task) => (
                    <TaskItem key={task.id} task={{ ...task, title: `${formatDay(task.date, locale)} · ${task.title}` }} />
                  ))}
                </ul>
              </details>
            )}
          </Section>

          <Section title={t.week.title}>
            <Card>
              <ol className="divide-y divide-border">
                {week.map((day) => (
                  <li key={day.date} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                    <p className="text-sm font-medium text-foreground">
                      {day.date === today ? t.week.today : formatDay(day.date, locale)}
                    </p>
                    {day.tasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">—</p>
                    ) : (
                      <ul className="-my-2">
                        {day.tasks.map((task) => (
                          <TaskItem key={task.id} task={task} compact />
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          </Section>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t.progress.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <CircularProgress value={overallPct} label={t.progress.overall}>
                  {overallPct}%
                </CircularProgress>
                <div className="text-sm">
                  <p className="font-medium text-foreground">{t.progress.overall}</p>
                  <p className="text-muted-foreground tabular">{format(t.progress.minutesDone, { done: doneMinutes, total: totalMinutes })}</p>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  [t.progress.completed, completed],
                  [t.progress.remaining, remaining],
                  [t.progress.skipped, skipped],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md bg-muted/60 px-2 py-2">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-display text-lg font-semibold tabular text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t.distribution.title}</CardTitle>
              <p className="text-sm text-muted-foreground">{t.distribution.description}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {subjects.map((code) => {
                const pct = subjectTotal > 0 ? Math.round((bySubject[code] / subjectTotal) * 100) : 0
                return (
                  <div key={code}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-foreground">{t.subjects[code]}</span>
                      <span className="text-muted-foreground tabular">
                        {format(t.distribution.minutes, { n: bySubject[code] })} · {pct}%
                      </span>
                    </div>
                    <ProgressBar value={pct} label={`${t.subjects[code]}: ${pct}%`} />
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{plan.weekly_objectives.length > 0 ? t.objectives.title : t.objectives.rulesTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {plan.weekly_objectives.length > 0 && (
                <ul className="list-disc space-y-1.5 pl-5 text-foreground">
                  {plan.weekly_objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              )}
              {plan.rationale && (
                <div>
                  <p className="font-medium text-foreground">{t.objectives.rationale}</p>
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{plan.rationale}</p>
                </div>
              )}
              <div>
                {plan.weekly_objectives.length > 0 && <p className="font-medium text-foreground">{t.objectives.rulesTitle}</p>}
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                  {topDomains && <li>{format(t.objectives.rulesFocus, { domains: topDomains })}</li>}
                  <li>{t.objectives.rulesUnknown}</li>
                  <li>{t.objectives.rulesReview}</li>
                  {mockCount > 0 && <li>{format(t.objectives.rulesMocks, { n: mockCount })}</li>}
                  {hasLightReview && <li>{t.objectives.rulesLight}</li>}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
