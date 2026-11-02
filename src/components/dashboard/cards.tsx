import Link from 'next/link'
import { CalendarDays, Check, Flame, Lock, Target, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { format, plural } from '@/lib/i18n/dict'
import type { dashboardDict } from '@/lib/i18n/dictionaries/dashboard'
import { formatDate, intlLocale } from '@/features/dashboard/format'
import { scalePercent, type ExamCountdown, type LatestEstimate, type Range, type WeekDay } from '@/features/dashboard/logic'
import type { MockCard } from '@/features/dashboard/server'

type T = (typeof dashboardDict)['en']

function CardTitleRow({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-sans text-[15px] font-semibold text-foreground">
        <span className="text-muted-foreground [&_svg]:size-4" aria-hidden>
          {icon}
        </span>
        {title}
      </h2>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Target score
// ---------------------------------------------------------------------------

function ScaleBar({
  label,
  min,
  max,
  estimate,
  marker,
  markerLabel,
  ariaLabel,
  emptyLabel,
}: {
  label: string
  min: number
  max: number
  estimate: Range | null
  marker: number | null
  markerLabel: string | null
  ariaLabel: string
  emptyLabel: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular text-muted-foreground">
          {estimate ? `${estimate.low}–${estimate.high}` : emptyLabel}
          {markerLabel ? <span className="ml-2 text-foreground">· {markerLabel}</span> : null}
        </span>
      </div>
      <div role="img" aria-label={ariaLabel} className="relative h-2.5 rounded-full bg-muted">
        {estimate && (
          <>
            <div
              className="absolute inset-y-0 rounded-full bg-primary/30"
              style={{ left: `${scalePercent(estimate.low, min, max)}%`, right: `${100 - scalePercent(estimate.high, min, max)}%` }}
            />
            <div
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
              style={{ left: `${scalePercent(estimate.mid, min, max)}%` }}
            />
          </>
        )}
        {marker !== null && (
          <div className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${scalePercent(marker, min, max)}%` }} />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular text-muted-foreground" aria-hidden>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

export function TargetScoreCard({
  t,
  target,
  latest,
  hasCompletedDiagnostic,
  showCta = true,
  className,
}: {
  t: T
  target: number | null
  latest: LatestEstimate
  hasCompletedDiagnostic: boolean
  showCta?: boolean
  className?: string
}) {
  const sectionTarget = target !== null ? Math.round(target / 20) * 10 : null
  const hasEstimate = Boolean(latest.rw || latest.math)
  const sections = [
    { key: 'rw', label: t.sectionNames.reading_writing, est: latest.rw },
    { key: 'math', label: t.sectionNames.math, est: latest.math },
  ] as const
  const gap = target !== null && latest.total ? target - latest.total.mid : null

  return (
    <Card className={cn('flex flex-col gap-4 p-5', className)}>
      <CardTitleRow
        icon={<Target />}
        title={t.target.title}
        action={
          <Link href="/dashboard/settings" className="text-[13px] font-medium text-primary hover:underline">
            {target !== null ? t.target.edit : t.target.setTarget}
          </Link>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        {target !== null ? (
          <p className="font-display text-[44px] font-semibold leading-none text-foreground">{target}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.target.noTarget}</p>
        )}
        {latest.total ? (
          <div className="text-right text-[13px]">
            <p className="tabular text-foreground">{format(t.target.latest, { low: latest.total.low, high: latest.total.high })}</p>
            {gap !== null && <p className="text-muted-foreground">{gap > 0 ? format(t.target.toGo, { n: gap }) : t.target.reached}</p>}
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {latest.total && (
          <ScaleBar
            label={t.target.total}
            min={400}
            max={1600}
            estimate={latest.total}
            marker={target}
            markerLabel={target !== null ? format(t.target.targetMarker, { n: target }) : null}
            ariaLabel={format(t.target.totalLabel, { low: latest.total.low, high: latest.total.high, target: target ?? '—' })}
            emptyLabel={t.target.sectionNoEstimate}
          />
        )}
        {(hasEstimate || target !== null) &&
          sections.map((s) => (
            <ScaleBar
              key={s.key}
              label={s.label}
              min={200}
              max={800}
              estimate={s.est}
              marker={sectionTarget}
              markerLabel={sectionTarget !== null ? format(t.target.targetMarker, { n: sectionTarget }) : null}
              ariaLabel={
                s.est
                  ? format(t.target.rangeLabel, { section: s.label, low: s.est.low, high: s.est.high, target: sectionTarget ?? '—' })
                  : `${s.label}: ${t.target.sectionNoEstimate}`
              }
              emptyLabel={t.target.sectionNoEstimate}
            />
          ))}
      </div>

      {!hasEstimate && (
        <div className="rounded-md bg-muted/60 p-3 text-[13px] text-muted-foreground">
          <p className="font-medium text-foreground">{t.target.noEstimate}</p>
          <p className="mt-0.5">{hasCompletedDiagnostic ? t.target.noEstimateMock : t.target.noEstimateDiag}</p>
          {showCta && (
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link href={hasCompletedDiagnostic ? '/dashboard/mock-exams' : '/dashboard/diagnostic'}>
                {hasCompletedDiagnostic ? t.target.takeMock : t.target.takeDiagnostic}
              </Link>
            </Button>
          )}
        </div>
      )}

      <p className="mt-auto text-xs text-muted-foreground">
        {sectionTarget !== null && (hasEstimate || target !== null) ? `${t.target.sectionTarget}. ` : ''}
        {hasEstimate ? t.recent.estimateNote : ''}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Streak with the current week
// ---------------------------------------------------------------------------

export function StreakCard({ t, streak, week, locale, className }: { t: T; streak: number; week: WeekDay[]; locale: string; className?: string }) {
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' })
  const weekdayLong = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', timeZone: 'UTC' })
  const todayActive = week.some((d) => d.isToday && d.active)
  const hint = streak === 0 ? t.stats.streakNone : todayActive ? t.stats.streakActive : t.stats.streakKeep

  return (
    <Card className={cn('flex flex-col gap-4 p-5', className)}>
      <CardTitleRow icon={<Flame />} title={t.streakCard.title} />
      <div>
        <p className="font-display text-[40px] font-semibold leading-none text-foreground">{plural(streak, t.stats.days)}</p>
        <p className="mt-1.5 text-[13px] text-muted-foreground">{hint}</p>
      </div>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">{t.streakCard.week}</p>
        <ol className="grid grid-cols-7 gap-1">
          {week.map((d) => {
            const date = new Date(`${d.date}T12:00:00Z`)
            const name = weekdayLong.format(date)
            const status = d.isFuture
              ? format(t.streakCard.upcoming, { day: name })
              : d.active
                ? format(t.streakCard.studied, { day: name })
                : format(t.streakCard.notStudied, { day: name })
            return (
              <li key={d.date} className="flex flex-col items-center gap-1.5">
                <span className="sr-only">
                  {status}
                  {d.isToday ? ` (${t.streakCard.today})` : ''}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full',
                    d.active && 'bg-primary text-primary-foreground',
                    !d.active && !d.isFuture && 'bg-muted',
                    d.isFuture && 'border border-dashed border-border-strong',
                    d.isToday && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
                  )}
                >
                  {d.active && <Check className="size-4" />}
                </span>
                <span aria-hidden className={cn('text-[11px]', d.isToday ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                  {weekday.format(date)}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Exam countdown (days, calm)
// ---------------------------------------------------------------------------

export function ExamCountdownCard({ t, exam, locale, className }: { t: T; exam: ExamCountdown; locale: string; className?: string }) {
  const date = 'date' in exam ? formatDate(exam.date, locale, 'UTC', { dateStyle: 'long' }) : ''
  return (
    <Card className={cn('flex flex-col gap-3 p-5', className)}>
      <CardTitleRow icon={<CalendarDays />} title={t.exam.title} />
      {exam.state === 'upcoming' && (
        <div>
          <p className="font-display text-[40px] font-semibold leading-none text-foreground">{plural(exam.days, t.exam.days)}</p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{format(t.exam.until, { date })}</p>
          {exam.weeks >= 2 && <p className="mt-0.5 text-[13px] text-muted-foreground">{format(t.exam.weeks, { n: exam.weeks })}</p>}
        </div>
      )}
      {exam.state === 'today' && <p className="text-sm font-medium text-foreground">{t.exam.today}</p>}
      {exam.state === 'passed' && (
        <div className="text-sm">
          <p className="text-foreground">{format(t.exam.passed, { date })}</p>
          <Link href="/dashboard/settings" className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline">
            {t.exam.update}
          </Link>
        </div>
      )}
      {exam.state === 'unset' && (
        <div className="text-sm">
          <p className="font-medium text-foreground">{t.exam.unset}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{t.exam.unsetBody}</p>
          <Link href="/dashboard/settings" className="mt-2 inline-block text-[13px] font-medium text-primary hover:underline">
            {t.exam.set}
          </Link>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Mock exam
// ---------------------------------------------------------------------------

export function MockExamCard({ t, mock, className }: { t: T; mock: MockCard; className?: string }) {
  return (
    <Card className={cn('flex flex-col gap-3 p-5', className)}>
      <CardTitleRow
        icon={<Timer />}
        title={t.mock.title}
        action={
          <Link href="/dashboard/mock-exams" className="text-[13px] font-medium text-primary hover:underline">
            {t.mock.viewAll}
          </Link>
        }
      />
      {mock.state === 'in_progress' && (
        <>
          <div>
            <p className="font-medium text-foreground">{mock.title}</p>
            <p className="text-[13px] text-muted-foreground">{t.mock.inProgress}</p>
          </div>
          <Button asChild size="sm" className="self-start">
            <Link href={mock.href}>{t.mock.resume}</Link>
          </Button>
        </>
      )}
      {mock.state === 'next' && (
        <>
          <div>
            <p className="font-medium text-foreground">{mock.title}</p>
            <p className="text-[13px] text-muted-foreground">{mock.isFullLength ? t.mock.fullLength : t.mock.shortened}</p>
          </div>
          {mock.included ? (
            <>
              {mock.allowance && (
                <p className="text-[13px] text-muted-foreground">
                  {mock.allowance.limit === null
                    ? t.mock.unlimited
                    : mock.allowance.used >= mock.allowance.limit
                      ? t.mock.limitReached
                      : format(t.mock.allowance, { used: mock.allowance.used, limit: mock.allowance.limit })}
                </p>
              )}
              <Button asChild variant="secondary" size="sm" className="self-start">
                <Link href={mock.href}>{t.mock.start}</Link>
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" aria-hidden />
                {t.mock.notIncluded}
              </span>
              <Link href="/dashboard/subscription" data-purchase-cta="" className="font-medium text-primary hover:underline">
                {t.mock.seePlans}
              </Link>
            </div>
          )}
        </>
      )}
      {mock.state === 'none' && <p className="text-[13px] text-muted-foreground">{t.mock.none}</p>}
      {mock.state === 'all_done' && <p className="text-[13px] text-muted-foreground">{t.mock.allDone}</p>}
    </Card>
  )
}
