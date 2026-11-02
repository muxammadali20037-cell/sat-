'use client'

import { AlertCircle, Check, ChevronDown, Clock, Loader2, Sigma } from 'lucide-react'
import { cn, formatClock } from '@/lib/utils'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { examsDict } from '@/lib/i18n/dictionaries/exams'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menus'
import { RichText } from '@/components/learning/rich-text'
import type { ExamSection } from '@/features/exams/machine'
import type { QueueStatus } from './use-answer-queue'

/** Module countdown. Display-only; announces 5 and 1 minute left via aria-live. */
export function ExamTimer({ remaining, hidden, onToggle }: { remaining: number; hidden: boolean; onToggle: () => void }) {
  const t = useDict(examsDict).runner
  const announcement = remaining <= 60 ? t.oneMinute : remaining <= 300 ? t.fiveMinutes : ''
  const urgent = remaining <= 300
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2">
        {hidden ? (
          <span className="flex h-8 items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden /> {t.timerHidden}
          </span>
        ) : (
          <span
            className={cn('font-sans text-xl font-semibold tabular sm:text-[22px]', urgent ? 'text-destructive' : 'text-foreground')}
            role="timer"
            aria-label={`${t.timeRemaining}: ${formatClock(remaining)}`}
          >
            {formatClock(remaining)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-full border border-border-strong px-2.5 text-[11px] font-medium leading-5 text-muted-foreground hover:bg-muted"
      >
        {hidden ? t.showTimer : t.hideTimer}
      </button>
      <p className="sr-only" aria-live="polite" aria-atomic>
        {announcement}
      </p>
    </div>
  )
}

export function DirectionsPopover({ section }: { section: ExamSection }) {
  const t = useDict(examsDict).runner
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground underline-offset-2 hover:underline">
        {t.directions} <ChevronDown className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(30rem,calc(100vw-2rem))] space-y-3 text-[14px] leading-relaxed">
        <p className="font-semibold">{t.directionsTitle}</p>
        <p>{section === 'math' ? t.directionsMath : t.directionsRw}</p>
        {section === 'math' && <p className="text-muted-foreground">{t.directionsSpr}</p>}
      </PopoverContent>
    </Popover>
  )
}

/** Formula reference for Math, written in our own words and layout. */
export function ReferencePopover() {
  const t = useDict(examsDict)
  const r = t.reference
  const rows: Array<{ title: string; items: Array<[string, string]> }> = [
    {
      title: r.area,
      items: [
        [r.rectangle, '$A = \\ell w$, $\\;P = 2\\ell + 2w$'],
        [r.triangle, '$A = \\tfrac{1}{2}bh$'],
        [r.circle, '$A = \\pi r^2$, $\\;C = 2\\pi r$'],
      ],
    },
    {
      title: r.rightTriangles,
      items: [
        [r.pythagorean, '$a^2 + b^2 = c^2$'],
        [r.special3060, '$x,\\; x\\sqrt{3},\\; 2x$'],
        [r.special45, '$s,\\; s,\\; s\\sqrt{2}$'],
      ],
    },
    {
      title: r.volume,
      items: [
        [r.prism, '$V = \\ell w h$'],
        [r.cylinder, '$V = \\pi r^2 h$'],
        [r.sphere, '$V = \\tfrac{4}{3}\\pi r^3$'],
        [r.cone, '$V = \\tfrac{1}{3}\\pi r^2 h$'],
        [r.pyramid, '$V = \\tfrac{1}{3}\\ell w h$'],
      ],
    },
  ]
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-medium hover:bg-muted">
        <Sigma className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t.runner.reference}</span>
        <span className="sr-only sm:hidden">{t.runner.reference}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto">
        <p className="font-semibold">{r.title}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{r.intro}</p>
        <div className="mt-3 space-y-4">
          {rows.map((group) => (
            <section key={group.title}>
              <h3 className="font-sans text-[13px] font-semibold text-muted-foreground">{group.title}</h3>
              <dl className="mt-1.5 divide-y divide-border rounded-lg border border-border">
                {group.items.map(([label, tex]) => (
                  <div key={label} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <dt>{label}</dt>
                    <dd className="text-right">
                      <RichText as="span" source={tex} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <section>
            <h3 className="font-sans text-[13px] font-semibold text-muted-foreground">{r.angles}</h3>
            <ul className="mt-1.5 space-y-1 text-sm">
              <li>
                <RichText as="span" source={r.triangleSum} />
              </li>
              <li>
                <RichText as="span" source={r.fullTurn} />
              </li>
            </ul>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function SaveIndicator({ status }: { status: QueueStatus }) {
  const t = useDict(examsDict).runner
  if (status.kind === 'idle') return <span className="text-[13px] text-muted-foreground" aria-live="polite" />
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[13px]', status.kind === 'error' ? 'text-destructive' : 'text-muted-foreground')}
      aria-live="polite"
    >
      {status.kind === 'saving' && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {status.kind === 'saved' && <Check className="size-3.5 text-success" aria-hidden />}
      {status.kind === 'error' && <AlertCircle className="size-3.5" aria-hidden />}
      <span className="hidden sm:inline">
        {status.kind === 'saving' ? t.saving : status.kind === 'saved' ? t.saved : format(t.offline, { n: status.pending })}
      </span>
      {status.kind === 'error' && <span className="sm:hidden">{status.pending}</span>}
    </span>
  )
}
