import Link from 'next/link'
import { BookOpen, ChevronRight, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { Section } from '@/components/layout/page-header'
import { cn } from '@/lib/utils'
import { format } from '@/lib/i18n/dict'
import type { dashboardDict } from '@/lib/i18n/dictionaries/dashboard'
import { formatDate, formatTimestamp, percent } from '@/features/dashboard/format'
import { practiceHref, type Recommendation, type SkillStat } from '@/features/analytics/aggregate'
import type { ContinueLearning, RecentResult, TodayTask } from '@/features/dashboard/server'

type T = (typeof dashboardDict)['en']

// ---------------------------------------------------------------------------
// Continue learning
// ---------------------------------------------------------------------------

export function ContinueLearningPanel({ t, data }: { t: T; data: ContinueLearning }) {
  if (data.state === 'no_lessons' || data.state === 'all_done') {
    return (
      <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-sans text-[15px] font-semibold text-foreground">{t.continue.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{data.state === 'no_lessons' ? t.continue.noLessons : t.continue.allDone}</p>
        </div>
        <Button asChild variant="secondary" size="sm" className="self-start sm:self-auto">
          <Link href={data.state === 'no_lessons' ? '/dashboard/practice' : '/dashboard/courses'}>
            {data.state === 'no_lessons' ? t.recommended.practise : t.continue.browse}
          </Link>
        </Button>
      </Card>
    )
  }

  const { lesson } = data
  const pct = lesson.durationSeconds > 0 ? Math.min(1, data.watchedSeconds / lesson.durationSeconds) : 0
  const Icon = lesson.kind === 'video' ? PlayCircle : BookOpen
  return (
    <Card className="p-5">
      <h2 className="font-sans text-[15px] font-semibold text-foreground">{t.continue.title}</h2>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary" aria-hidden>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {data.state === 'next' ? format(t.continue.nextUp, { course: data.courseTitle }) : data.courseTitle} ·{' '}
              {lesson.kind === 'video' ? t.continue.video : t.continue.text}
            </p>
            <p className="truncate font-medium text-foreground">{lesson.title}</p>
            {data.state === 'resume' && (
              <div className="mt-2 flex items-center gap-3">
                <ProgressBar
                  value={pct * 100}
                  size="sm"
                  className="max-w-48"
                  label={format(lesson.kind === 'video' ? t.continue.watched : t.continue.read, { pct: percent(pct) })}
                />
                <span className="whitespace-nowrap text-xs tabular text-muted-foreground">
                  {format(lesson.kind === 'video' ? t.continue.watched : t.continue.read, { pct: percent(pct) })}
                </span>
              </div>
            )}
          </div>
        </div>
        <Button asChild className="self-start sm:self-auto">
          <Link href={`/dashboard/lesson/${lesson.id}`}>
            {data.state === 'resume'
              ? lesson.kind === 'video' && data.positionSeconds > 5
                ? format(t.continue.resumeAt, { time: formatTimestamp(data.positionSeconds) })
                : t.continue.resume
              : t.continue.start}
          </Link>
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Today's schedule (study plan tasks, read-only)
// ---------------------------------------------------------------------------

const TASK_BORDER: Record<TodayTask['type'], string> = {
  lesson: 'border-l-primary',
  practice: 'border-l-accent',
  review: 'border-l-navy-700 dark:border-l-sidebar-foreground',
  mock_exam: 'border-l-foreground',
  diagnostic: 'border-l-muted-foreground',
}

export function TodaySchedule({ t, plan }: { t: T; plan: { hasPlan: boolean; included: boolean; tasks: TodayTask[] } }) {
  const done = plan.tasks.filter((x) => x.status === 'completed').length
  return (
    <Section
      title={t.today.title}
      description={plan.tasks.length > 0 ? format(t.today.done, { done, total: plan.tasks.length }) : undefined}
      actions={
        plan.hasPlan ? (
          <Link href="/dashboard/study-plan" className="text-[13px] font-medium text-primary hover:underline">
            {t.today.viewPlan}
          </Link>
        ) : null
      }
    >
      {!plan.hasPlan ? (
        <div className="rounded-lg border border-dashed border-border-strong p-5 text-sm">
          <p className="font-medium text-foreground">{t.today.noPlan}</p>
          <p className="mt-0.5 text-muted-foreground">{plan.included ? t.today.noPlanBody : t.today.noPlanLocked}</p>
          <Link href={plan.included ? '/dashboard/study-plan' : '/dashboard/subscription'} className="mt-3 inline-block text-[13px] font-medium text-primary hover:underline">
            {plan.included ? t.today.createPlan : t.mock.seePlans}
          </Link>
        </div>
      ) : plan.tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong p-5 text-sm text-muted-foreground">
          {t.today.nothingToday}{' '}
          <Link href="/dashboard/study-plan" className="font-medium text-primary hover:underline">
            {t.today.viewPlan}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {plan.tasks.map((task) => (
            <li key={task.id}>
              <Link
                href={task.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border border-l-4 border-border bg-card px-4 py-3 transition-colors hover:bg-muted/50',
                  TASK_BORDER[task.type],
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {t.today.types[task.type]} · {format(t.today.minutes, { n: task.minutes })}
                  </p>
                  <p className={cn('truncate font-medium', task.status === 'pending' ? 'text-foreground' : 'text-muted-foreground')}>{task.title}</p>
                </div>
                {task.status !== 'pending' && <Badge variant={task.status === 'completed' ? 'success' : 'neutral'}>{t.today.status[task.status]}</Badge>}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Recommended practice
// ---------------------------------------------------------------------------

export function RecommendedPractice({ t, items }: { t: T; items: Recommendation[] }) {
  return (
    <Section title={t.recommended.title} description={items.length > 0 ? t.recommended.description : undefined}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.recommended.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((s) => (
            <li key={s.skillId} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{s.domainName}</p>
                <p className="font-medium text-foreground">{s.skillName}</p>
                <p className="text-xs text-muted-foreground">
                  {s.reason === 'unpracticed'
                    ? t.recommended.unpracticed
                    : s.reason === 'weak'
                      ? format(t.recommended.weak, { pct: percent(s.accuracy), n: s.answered })
                      : format(t.recommended.review, { pct: percent(s.accuracy) })}
                </p>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link href={practiceHref(s)} aria-label={format(t.recommended.practiseSkill, { skill: s.skillName })}>
                  {t.recommended.practise}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Strongest / weakest skills
// ---------------------------------------------------------------------------

function SkillList({ t, title, items, linkToPractice }: { t: T; title: string; items: SkillStat[]; linkToPractice?: boolean }) {
  return (
    <div>
      <h3 className="mb-2 font-sans text-[13px] font-semibold text-muted-foreground">{title}</h3>
      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.skillId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {linkToPractice ? (
                <Link href={practiceHref(s)} className="min-w-0 truncate font-medium text-foreground hover:text-primary hover:underline">
                  {s.skillName}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-medium text-foreground">{s.skillName}</span>
              )}
              <span className="shrink-0 tabular font-semibold text-foreground">{percent(s.accuracy)}</span>
            </div>
            <ProgressBar value={(s.accuracy ?? 0) * 100} size="sm" className="mt-1.5" label={`${s.skillName} ${percent(s.accuracy)}`} />
            <p className="mt-1 text-xs text-muted-foreground">
              {s.domainName} · {format(t.weak.answered, { n: s.answered })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SkillExtremes({ t, strongest, weakest }: { t: T; strongest: SkillStat[]; weakest: SkillStat[] }) {
  // A skill appears in only one list; with few practised skills, "needs work" wins.
  const weakIds = new Set(weakest.map((s) => s.skillId))
  const strong = strongest.filter((s) => !weakIds.has(s.skillId) && (s.accuracy ?? 0) > (weakest[0]?.accuracy ?? -1))
  return (
    <Section title={t.skills.title}>
      {weakest.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.skills.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-1">
          <SkillList t={t} title={t.skills.weakest} items={weakest.slice(0, 3)} linkToPractice />
          {strong.length > 0 && <SkillList t={t} title={t.skills.strongest} items={strong.slice(0, 3)} />}
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Recent results
// ---------------------------------------------------------------------------

export function RecentResults({ t, items, locale, timeZone }: { t: T; items: RecentResult[]; locale: string; timeZone: string }) {
  return (
    <Section
      title={t.recent.title}
      actions={
        items.length > 0 ? (
          <Link href="/dashboard/results" className="text-[13px] font-medium text-primary hover:underline">
            {t.recent.allResults}
          </Link>
        ) : null
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.recent.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((r) => {
            const name =
              r.kind === 'practice'
                ? [r.practiceMode ? t.recent.modes[r.practiceMode] : t.recent.kinds.practice, r.contextName].filter(Boolean).join(' · ')
                : (r.title ?? t.recent.kinds[r.kind])
            return (
              <li key={r.id}>
                <Link href={r.href} className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.kind === 'mock_exam' ? 'navy' : r.kind === 'diagnostic' ? 'primary' : 'neutral'}>{t.recent.kinds[r.kind]}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(r.completedAt, locale, timeZone)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{name}</p>
                    <p className="text-xs tabular text-muted-foreground">
                      {format(t.recent.score, { correct: r.correct, total: r.total })}
                      {r.estimate ? ` · ${format(t.recent.estimate, { low: r.estimate.low, high: r.estimate.high })}` : ''}
                    </p>
                  </div>
                  <span className="sr-only">{t.recent.view}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {items.some((r) => r.estimate) && <p className="text-xs text-muted-foreground">{t.recent.estimateNote}</p>}
    </Section>
  )
}
