import Link from 'next/link'
import { BookOpen, CalendarDays, Check, ChevronRight, CircleAlert, Clock3, Compass, Flame, ListChecks, PenLine, RotateCcw, Target } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { format, plural } from '@/lib/i18n/dict'
import type { dashboardDict } from '@/lib/i18n/dictionaries/dashboard'
import { formatDate, intlLocale, percent } from '@/features/dashboard/format'
import { MASTERY_MIN_ANSWERS, type MasteryDomain, type MasteryLevel, type Mission, type MissionItem, type WeekSummary } from '@/features/dashboard/today'
import type { RecentMistake } from '@/features/dashboard/server'

type T = (typeof dashboardDict)['en']

function SectionTitle({ icon, title, description, action }: { icon: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-sans text-[15px] font-semibold text-foreground">
          <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>
            {icon}
          </span>
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Daily mission
// ---------------------------------------------------------------------------

const taskIcon: Record<string, React.ReactNode> = {
  diagnostic: <Compass />,
  lesson: <BookOpen />,
  practice: <PenLine />,
  review: <RotateCcw />,
  mock_exam: <ListChecks />,
  mistakes: <RotateCcw />,
  minutes: <Clock3 />,
}

function missionText(item: MissionItem, t: T): { title: string; hint: string | null; icon: React.ReactNode; href: string | null } {
  const m = t.mission
  switch (item.kind) {
    case 'diagnostic':
      return { title: m.diagnostic, hint: m.diagnosticHint, icon: taskIcon.diagnostic, href: item.href }
    case 'plan_task':
      return { title: item.title, hint: format(m.planMinutes, { n: item.minutes }), icon: taskIcon[item.taskType], href: item.href }
    case 'practice':
      return { title: format(m.practice, { n: item.progress.target }), hint: format(m.practiceHint, { skill: item.skillName }), icon: taskIcon.practice, href: item.href }
    case 'lesson':
      return { title: item.resume ? m.lessonResume : m.lessonStart, hint: item.lessonTitle, icon: taskIcon.lesson, href: item.href }
    case 'mistakes':
      return { title: m.mistakes, hint: plural(item.count, m.mistakesHint), icon: taskIcon.mistakes, href: item.href }
    case 'minutes':
      return { title: format(m.minutes, { n: item.progress.target }), hint: m.minutesHint, icon: taskIcon.minutes, href: null }
  }
}

export function MissionCard({ t, mission, className }: { t: T; mission: Mission; className?: string }) {
  const m = t.mission
  const complete = mission.total > 0 && mission.done === mission.total
  return (
    <Card className={cn('flex flex-col p-5', className)}>
      <SectionTitle
        icon={<Target />}
        title={m.title}
        description={mission.total > 0 ? (mission.source === 'plan' ? m.fromPlan : m.fromRules) : undefined}
        action={
          mission.total > 0 ? (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular text-foreground">
              {format(m.progress, { done: mission.done, total: mission.total })}
            </span>
          ) : null
        }
      />
      {mission.total === 0 ? (
        <p className="mt-4 text-[13px] text-muted-foreground">{m.empty}</p>
      ) : (
        <>
          <ol className="mt-4 divide-y divide-border">
            {mission.items.map((item, i) => {
              const { title, hint, icon, href } = missionText(item, t)
              const progress = 'progress' in item ? item.progress : null
              return (
                <li key={`${item.kind}-${i}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
                      item.done ? 'bg-success text-white' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {item.done ? <Check /> : icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium', item.done ? 'text-muted-foreground line-through decoration-1' : 'text-foreground')}>
                      {title}
                      {item.done && <span className="sr-only"> ({m.done})</span>}
                    </p>
                    {hint && <p className="truncate text-[13px] text-muted-foreground">{hint}</p>}
                    {progress && !item.done && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <ProgressBar value={progress.value} max={progress.target} label={title} size="sm" className="max-w-48" />
                        <span className="text-xs tabular text-muted-foreground">
                          {Math.min(progress.value, progress.target)}/{progress.target}
                        </span>
                      </div>
                    )}
                  </div>
                  {href && !item.done && (
                    <Button asChild size="sm" variant="secondary" className="shrink-0">
                      <Link href={href}>{m.open}</Link>
                    </Button>
                  )}
                </li>
              )
            })}
          </ol>
          {complete && <p className="mt-4 rounded-md bg-success/10 px-3 py-2 text-[13px] text-foreground">{m.allDone}</p>}
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Week: streak, minutes per day, weekly goal
// ---------------------------------------------------------------------------

export function WeekCard({ t, week, streak, locale, className }: { t: T; week: WeekSummary; streak: number; locale: string; className?: string }) {
  const w = t.week
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' })
  const weekdayLong = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', timeZone: 'UTC' })
  // Bars show minutes; in a week with answers but no timed study minutes (timed tests do not add
  // minutes) they show questions instead, so real activity is never drawn as an empty week.
  const byMinutes = week.totalMinutes > 0 || week.totalQuestions === 0
  const value = (d: WeekSummary['days'][number]) => (byMinutes ? d.minutes : d.questions)
  const dailyGoal = byMinutes && week.goalMinutes ? week.goalMinutes / 7 : 0
  const scale = Math.max(dailyGoal, ...week.days.map(value), 1)
  const todayActive = week.days.some((d) => d.isToday && d.active)
  const streakHint = streak === 0 ? t.stats.streakNone : todayActive ? t.stats.streakActive : t.stats.streakKeep

  return (
    <Card className={cn('flex flex-col gap-4 p-5', className)}>
      <SectionTitle icon={<CalendarDays />} title={w.title} />
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-display text-[28px] font-semibold leading-none text-foreground">
            <Flame className="size-5 text-warning" aria-hidden />
            {plural(streak, t.stats.days)}
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{streakHint}</p>
        </div>
        <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{plural(week.activeDays, w.activeDays)}</p>
      </div>

      <ol className="grid h-28 grid-cols-7 items-end gap-1.5" aria-label={w.title}>
        {week.days.map((d) => {
          const date = new Date(`${d.date}T12:00:00Z`)
          const v = value(d)
          const height = v > 0 ? Math.max(8, (v / scale) * 100) : 0
          return (
            <li key={d.date} className="flex h-full flex-col items-center justify-end gap-1">
              <span className="sr-only">{format(w.dayLabel, { day: weekdayLong.format(date), minutes: d.minutes, questions: d.questions })}</span>
              <span aria-hidden className="relative flex w-full flex-1 items-end justify-center">
                {dailyGoal > 0 && (
                  <span className="absolute inset-x-0 border-t border-dashed border-border-strong" style={{ bottom: `${(dailyGoal / scale) * 100}%` }} />
                )}
                <span
                  className={cn(
                    'w-full max-w-7 rounded-t-md',
                    v > 0 ? (dailyGoal > 0 && d.minutes >= dailyGoal ? 'bg-success' : 'bg-primary') : d.isFuture ? 'bg-transparent' : 'bg-muted',
                  )}
                  style={{ height: v > 0 ? `${height}%` : '4px' }}
                />
              </span>
              <span aria-hidden className={cn('text-[11px]', d.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {weekday.format(date)}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="font-medium text-foreground">{format(w.minutes, { n: week.totalMinutes })}</span>
          <span className="tabular text-muted-foreground">{plural(week.totalQuestions, w.questions)}</span>
        </div>
        {week.goalMinutes ? (
          <div className="flex items-center gap-2">
            <ProgressBar value={week.totalMinutes} max={week.goalMinutes} label={format(w.goal, { n: week.goalMinutes })} size="sm" tone="success" />
            <span className="shrink-0 text-xs tabular text-muted-foreground">{format(w.goal, { n: week.goalMinutes })}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {w.goalUnset}{' '}
            <Link href="/dashboard/settings" className="font-medium text-primary hover:underline">
              {w.settings}
            </Link>
          </p>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Mastery map: the eight Digital SAT domains
// ---------------------------------------------------------------------------

const levelTone: Record<MasteryLevel, { dot: string; bar: 'destructive' | 'warning' | 'primary' | 'success' }> = {
  not_started: { dot: 'bg-border-strong', bar: 'primary' },
  too_few: { dot: 'bg-border-strong', bar: 'primary' },
  foundation: { dot: 'bg-destructive', bar: 'destructive' },
  developing: { dot: 'bg-warning', bar: 'warning' },
  proficient: { dot: 'bg-primary', bar: 'primary' },
  advanced: { dot: 'bg-success', bar: 'success' },
}

export function MasteryMap({ t, domains }: { t: T; domains: MasteryDomain[] }) {
  const m = t.mastery
  const groups = (['math', 'reading_writing'] as const).map((code) => ({ code, items: domains.filter((d) => d.subjectCode === code) }))
  return (
    <Card className="p-5">
      <SectionTitle icon={<Target />} title={m.title} description={format(m.description, { n: MASTERY_MIN_ANSWERS })} />
      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        {groups.map((g) =>
          g.items.length === 0 ? null : (
            <section key={g.code} aria-labelledby={`mastery-${g.code}`}>
              <h3 id={`mastery-${g.code}`} className="mb-2 text-xs font-semibold text-muted-foreground">
                {t.sectionNames[g.code]}
              </h3>
              <ul className="divide-y divide-border">
                {g.items.map((d) => {
                  const tone = levelTone[d.level]
                  const hasLevel = d.level !== 'not_started' && d.level !== 'too_few'
                  return (
                    <li key={d.id} className="py-3 first:pt-1">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={d.href} className="group min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary group-hover:underline">{d.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {format(m.weight, { n: Math.round(d.weightPercent) })}
                            {d.lessonsTotal > 0 ? ` · ${format(m.lessons, { done: d.lessonsCompleted, total: d.lessonsTotal })}` : ''}
                          </span>
                        </Link>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground">
                          <span aria-hidden className={cn('size-2 rounded-full', tone.dot)} />
                          {m.levels[d.level]}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar
                          value={hasLevel ? (d.scored.accuracy ?? 0) * 100 : 0}
                          label={`${d.name}: ${m.levels[d.level]}`}
                          size="sm"
                          tone={tone.bar}
                        />
                        <span className="w-24 shrink-0 text-right text-xs tabular text-muted-foreground">
                          {d.scored.answered > 0 ? `${percent(d.scored.accuracy)} · ${plural(d.scored.answered, m.answers)}` : '—'}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ),
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recent mistakes
// ---------------------------------------------------------------------------

export function RecentMistakes({ t, items, locale, timeZone }: { t: T; items: RecentMistake[]; locale: string; timeZone: string }) {
  const m = t.mistakes
  return (
    <Card className="p-5">
      <SectionTitle icon={<CircleAlert />} title={m.title} description={items.length > 0 ? m.description : undefined} />
      {items.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">{m.empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((it) => (
            <li key={it.questionId}>
              <Link href={it.href} className="group flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-foreground group-hover:text-primary">{it.excerpt}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[it.skillName, m.kinds[it.kind], formatDate(it.answeredAt, locale, timeZone, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="flex shrink-0 items-center text-[13px] font-medium text-primary">
                  {m.review}
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
