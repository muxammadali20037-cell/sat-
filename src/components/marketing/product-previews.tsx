import { BookOpen, Clock, Flame, PenLine, RotateCcw, Target } from 'lucide-react'
import { CircularProgress, ProgressBar, StatCard } from '@/components/ui/progress'
import { PracticeSetPreview } from './practice-set-preview'
import { PreviewFrame, SampleLabel } from './section'
import type { PublicDict } from '@/lib/i18n/dictionaries/public'

/*
 * Marketing renders of real dashboard components with OBVIOUSLY FICTIONAL sample data.
 * Always labelled "Preview · Sample data" and never presented as real student results.
 */

const TASK_ICONS = [BookOpen, PenLine, RotateCcw]

export function DashboardPreview({ t, labels }: { t: PublicDict['dashboardPreview']; labels: PublicDict['labels'] }) {
  const s = t.stats
  return (
    <PreviewFrame>
      <div className="rounded-xl border border-border bg-background p-4 sm:p-6">
        <SampleLabel preview={labels.preview} sample={labels.sampleData} note={labels.sampleNote} />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={s.streak} value={s.streakValue} icon={<Flame />} />
          <StatCard label={s.answered} value={s.answeredValue} icon={<PenLine />} />
          <StatCard label={s.accuracy} value={s.accuracyValue} icon={<Target />} />
          <StatCard label={s.time} value={s.timeValue} icon={<Clock />} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{t.todayTitle}</p>
            <ul className="mt-3 divide-y divide-border">
              {t.tasks.map((task, i) => {
                const Icon = TASK_ICONS[i % TASK_ICONS.length]!
                return (
                  <li key={task.title} className="flex items-center gap-3 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted-foreground">{task.kind}</span>
                      <span className="block truncate text-sm font-medium text-foreground">{task.title}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular">{task.meta}</span>
                  </li>
                )
              })}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{t.setTitle}</p>
            <div className="mt-3">
              <PracticeSetPreview />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t.setHint}</p>
          </div>
        </div>
      </div>
    </PreviewFrame>
  )
}

export function ProgressPreview({ t, labels }: { t: PublicDict['progress']; labels: PublicDict['labels'] }) {
  const math = 68
  const rw = 74
  return (
    <PreviewFrame>
      <div className="rounded-xl border border-border bg-background p-4 sm:p-6">
        <SampleLabel preview={labels.preview} sample={labels.sampleData} note={labels.sampleNote} />
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-4">
              <CircularProgress value={math} label={t.mathLabel} size={64}>
                {math}%
              </CircularProgress>
              <p className="text-sm font-medium text-foreground">{t.mathLabel}</p>
            </div>
            <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-4">
              <CircularProgress value={rw} label={t.rwLabel} size={64} tone="navy">
                {rw}%
              </CircularProgress>
              <p className="text-sm font-medium text-foreground">{t.rwLabel}</p>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{t.domainsTitle}</p>
            <ul className="mt-4 grid grid-cols-1 gap-4">
              {t.domains.map((d) => (
                <li key={d.name}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">{d.name}</span>
                    <span className="shrink-0 font-semibold tabular text-foreground">{d.value}%</span>
                  </div>
                  <ProgressBar value={d.value} label={d.name} tone={d.value < 60 ? 'warning' : 'primary'} />
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">{t.weakTitle}</p>
            <ul className="mt-3 grid grid-cols-1 gap-2">
              {t.weak.map((skill) => (
                <li key={skill} className="flex items-center gap-2.5 rounded-md bg-muted/70 px-3 py-2.5 text-sm text-foreground">
                  <Target className="size-4 shrink-0 text-warning" aria-hidden />
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </PreviewFrame>
  )
}
