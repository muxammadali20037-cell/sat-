import Link from 'next/link'
import { Check, Lock, Mountain, Send } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { format } from '@/lib/i18n/dict'
import type { pathDict } from '@/lib/i18n/dictionaries/path'
import type { PathView, StageId, StageView } from '@/features/path/stages'
import { telegramShareUrl } from '@/features/referrals/logic'

type T = (typeof pathDict)['en']
export type FocusSkill = { code: string; id: string; name: string }

const STAGE_DIFFICULTY: Record<StageId, 'easy' | 'medium' | 'hard'> = {
  foundation: 'easy',
  climb: 'medium',
  builder: 'medium',
  strong: 'hard',
  elite: 'hard',
  summit: 'hard',
}

export function PathOverview({
  t,
  path,
  estimate,
  skills,
  inviteUrl,
}: {
  t: T
  path: PathView
  estimate: number | null
  skills: Map<string, FocusSkill>
  inviteUrl: string
}) {
  const cur = path.current
  const shareText = format(t.shareText, { stage: t.stages[cur.id].name })
  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6" data-testid="path-summary">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t.estimateLabel}</p>
            <p className="mt-1 text-4xl font-semibold tabular" data-testid="path-estimate">
              {estimate ?? '—'}
              <span className="ml-2 text-base font-normal text-muted-foreground">/ 1600</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {estimate === null ? (
              <Button asChild>
                <Link href="/dashboard/diagnostic">{t.takeDiagnostic}</Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/dashboard/mock-exams">{t.takeMock}</Link>
              </Button>
            )}
            <Button asChild variant="secondary">
              <a href={telegramShareUrl(inviteUrl, shareText)} target="_blank" rel="noopener noreferrer">
                <Send /> {t.share}
              </a>
            </Button>
          </div>
        </div>
        {/* The whole 400–1600 scale with a tick at each stage goal. */}
        <div className="relative mt-6 h-3 rounded-full bg-muted" aria-hidden>
          <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${path.overall}%` }} />
          {path.stages.slice(0, -1).map((s) => (
            <span key={s.id} className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-background" style={{ left: `${((s.goal - 400) / 1200) * 100}%` }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular" aria-hidden>
          <span>400</span>
          <span>1600</span>
        </div>
        <p className="mt-3 text-sm">
          {estimate === null
            ? t.noEstimate
            : path.allPassed
              ? t.allPassed
              : format(t.toNext, { n: Math.max(0, cur.goal - estimate) })}
        </p>
      </Card>

      <ol className="relative space-y-3" data-testid="path-stages">
        {path.stages.map((s, i) => (
          <StageRow key={s.id} t={t} stage={s} index={i} skills={skills} />
        ))}
      </ol>

      <p className="max-w-3xl text-xs text-muted-foreground">{t.disclaimer}</p>
    </div>
  )
}

function StageRow({ t, stage, index, skills }: { t: T; stage: StageView; index: number; skills: Map<string, FocusSkill> }) {
  const copy = t.stages[stage.id]
  const current = stage.state === 'current'
  return (
    <li data-stage={stage.id} data-state={stage.state}>
      <Card className={cn('p-4 sm:p-5', current && 'border-primary ring-1 ring-primary/30')}>
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold [&_svg]:size-5',
              stage.state === 'passed' && 'bg-success text-white',
              current && 'bg-primary text-primary-foreground',
              stage.state === 'locked' && 'bg-muted text-muted-foreground',
            )}
          >
            {stage.state === 'passed' ? <Check /> : stage.state === 'locked' ? <Lock /> : index === 5 ? <Mountain /> : index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold">{copy.name}</h2>
              <span className="text-sm text-muted-foreground tabular">{format(t.band, { from: stage.from, goal: stage.goal })}</span>
              <span className={cn('text-xs font-medium', current ? 'text-primary' : stage.state === 'passed' ? 'text-success' : 'text-muted-foreground')}>
                {t.states[stage.state]}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{copy.tagline}</p>

            {current && (
              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section aria-labelledby="missions-title">
                  <h3 id="missions-title" className="text-sm font-semibold">
                    {t.missionsTitle} <span className="font-normal text-muted-foreground tabular">({stage.missionsDone}/{stage.missionViews.length})</span>
                  </h3>
                  <ul className="mt-3 space-y-3" data-testid="path-missions">
                    {stage.missionViews.map((m) => (
                      <li key={m.id} data-mission={m.id} data-done={m.done}>
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className={cn(m.done && 'text-success')}>
                            {m.done && <Check className="mr-1 inline size-4" aria-hidden />}
                            {t.missions[m.id]}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular">
                            {m.value}/{m.target}
                          </span>
                        </div>
                        <ProgressBar className="mt-1.5" value={m.value} max={m.target} label={t.missions[m.id]} size="sm" tone={m.done ? 'success' : 'primary'} />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">{t.missionsNote}</p>
                </section>
                <section aria-labelledby="focus-title">
                  <h3 id="focus-title" className="text-sm font-semibold">{t.focusTitle}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t.focusNote}</p>
                  <ul className="mt-3 space-y-2" data-testid="path-focus">
                    {[...stage.focus.math, ...stage.focus.reading_writing]
                      .map((code) => skills.get(code))
                      .filter((s): s is FocusSkill => !!s)
                      .map((s) => (
                        <li key={s.code} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                          <span className="min-w-0 truncate">{s.name}</span>
                          <Link
                            className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
                            href={`/dashboard/practice?skill=${s.id}&difficulty=${STAGE_DIFFICULTY[stage.id]}`}
                          >
                            {t.practice}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      </Card>
    </li>
  )
}
