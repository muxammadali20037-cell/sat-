'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { useDict } from '@/lib/i18n/client'
import { format, plural } from '@/lib/i18n/dict'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import type { ActionResult } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Input, Label, NativeSelect } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { createChallengeAction, endChallengeAction, setLeaderboardOptInAction } from '@/features/classroom/challenge-actions'
import { METRICS, POINTS } from '@/features/classroom/challenges'
import type { Engagement } from '@/features/classroom/challenge-server'

function useRun() {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const run = <R,>(fn: () => Promise<ActionResult<R>>, onOk?: () => void) =>
    start(async () => {
      const res = await fn()
      if (res.ok) {
        if (res.message) toast.success(res.message)
        onOk?.()
        router.refresh()
      } else toast.error(res.error)
    })
  return { pending, run }
}

const field = 'grid grid-cols-1 gap-1.5'

export function CreateChallengeForm({ workspaceId, groupId, today, nextWeek }: { workspaceId: string; groupId: string; today: string; nextWeek: string }) {
  const t = useDict(classroomDict).teach.challenges
  const { pending, run } = useRun()
  const [title, setTitle] = React.useState('')
  const [metric, setMetric] = React.useState<(typeof METRICS)[number]>('correct_answers')
  const [mode, setMode] = React.useState<'individual' | 'group'>('group')
  const [target, setTarget] = React.useState(200)
  const [startsOn, setStartsOn] = React.useState(today)
  const [endsOn, setEndsOn] = React.useState(nextWeek)
  return (
    <form
      className="grid grid-cols-1 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(() => createChallengeAction({ workspaceId, groupId, title, metric, mode, target, startsOn, endsOn }), () => setTitle(''))
      }}
    >
      <div className={field}>
        <Label htmlFor="ch-title">{t.name}</Label>
        <Input id="ch-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={field}>
          <Label htmlFor="ch-metric">{t.metric}</Label>
          <NativeSelect id="ch-metric" value={metric} onChange={(e) => setMetric(e.target.value as typeof metric)}>
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {t.metrics[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className={field}>
          <Label htmlFor="ch-mode">{t.mode}</Label>
          <NativeSelect id="ch-mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="group">{t.modes.group}</option>
            <option value="individual">{t.modes.individual}</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className={field}>
          <Label htmlFor="ch-target">{t.target}</Label>
          <Input id="ch-target" type="number" min={1} max={100000} value={target} onChange={(e) => setTarget(Number(e.target.value) || 1)} />
        </div>
        <div className={field}>
          <Label htmlFor="ch-from">{t.startsOn}</Label>
          <Input id="ch-from" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required />
        </div>
        <div className={field}>
          <Label htmlFor="ch-to">{t.endsOn}</Label>
          <Input id="ch-to" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} required />
        </div>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {t.create}
        </Button>
      </div>
    </form>
  )
}

export function LeaderboardOptIn({ workspaceId, enabled }: { workspaceId: string; enabled: boolean }) {
  const t = useDict(classroomDict).classes
  const { pending, run } = useRun()
  return (
    <label className="flex items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--primary)]"
        checked={enabled}
        disabled={pending}
        onChange={(e) => run(() => setLeaderboardOptInAction({ workspaceId, enabled: e.target.checked }))}
      />
      <span>
        <span className="font-medium text-foreground">{t.leaderboardOptIn}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{t.leaderboardHint}</span>
      </span>
    </label>
  )
}

export function EngagementPanel({ data, staff, dateLabel }: { data: Engagement; staff: boolean; dateLabel: Record<string, string> }) {
  const c = useDict(classroomDict)
  const t = c.teach.challenges
  const s = c.classes
  const { pending, run } = useRun()
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="engagement">
      <section className="rounded-lg border border-border bg-surface p-4" aria-label={t.leaderboard} data-testid="leaderboard">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Trophy className="size-4 text-muted-foreground" aria-hidden /> {t.leaderboard}
          <span className="text-xs font-normal text-muted-foreground">
            {dateLabel[data.week.from]} – {dateLabel[data.week.to]}
          </span>
        </h3>
        {data.me && (
          <p className="mt-1 text-[13px] text-foreground">{format(s.myWeek, { points: data.me.points, correct: data.me.correct, days: data.me.activeDays, work: data.me.classWork })}</p>
        )}
        {data.leaderboard.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">{t.leaderboardEmpty}</p>
        ) : (
          <ol className="mt-2 divide-y divide-border">
            {data.leaderboard.map((e) => (
              <li key={e.studentId} className={cn('flex items-center justify-between gap-2 py-1.5 text-sm', e.self && 'font-semibold')}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 shrink-0 text-right tabular text-muted-foreground">{e.rank}</span>
                  <span className="truncate">
                    {e.name}
                    {e.self && ` (${s.you})`}
                  </span>
                </span>
                <span className="shrink-0 tabular text-muted-foreground">{format(t.points, { n: e.points })}</span>
              </li>
            ))}
          </ol>
        )}
        {data.hiddenCount > 0 && <p className="mt-2 text-xs text-muted-foreground">{plural(data.hiddenCount, t.hidden)}</p>}
        <p className="mt-1 text-xs text-muted-foreground">{format(t.formula, { c: POINTS.correct })}</p>
      </section>

      <section className="space-y-3" aria-label={t.title} data-testid="challenges">
        {data.challenges.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t.empty}</p>
        ) : (
          data.challenges.map((ch) => {
            const when =
              ch.timing === 'upcoming' ? format(t.timing.upcoming, { date: dateLabel[ch.startsOn] ?? ch.startsOn }) : ch.timing === 'running' ? format(t.timing.running, { date: dateLabel[ch.endsOn] ?? ch.endsOn }) : t.timing.finished
            return (
              <article key={ch.id} className="space-y-2 rounded-lg border border-border bg-surface p-4" data-challenge={ch.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{ch.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.metrics[ch.metric]} · {t.modes[ch.mode]} · {ch.target}
                    </p>
                  </div>
                  <Badge variant={ch.timing === 'running' ? 'success' : 'neutral'}>{when}</Badge>
                </div>
                {ch.group && (
                  <div>
                    <ProgressBar value={ch.group.ratio * 100} label={ch.title} size="sm" />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ch.group.counted === 0 ? t.nobodyVisible : format(t.groupProgress, { value: ch.group.value, target: ch.group.target, n: ch.group.counted })}
                    </p>
                  </div>
                )}
                {ch.me && (
                  <div>
                    {ch.mode === 'individual' && <ProgressBar value={ch.me.ratio * 100} label={ch.title} size="sm" />}
                    <p className="mt-1 text-xs text-foreground">{format(s.myProgress, { value: ch.me.value, target: ch.me.target })}</p>
                    {ch.mode === 'group' && data.me && !data.me.optedIn && <p className="text-xs text-muted-foreground">{s.notCounted}</p>}
                  </div>
                )}
                {ch.people.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {ch.people.map((p) => (
                      <li key={p.studentId} className="flex justify-between gap-2">
                        <span className="truncate text-foreground">{p.name}</span>
                        <span className={cn('shrink-0 tabular', p.progress.done ? 'font-medium text-success' : 'text-muted-foreground')}>
                          {p.progress.value}/{p.progress.target}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {staff && ch.timing !== 'finished' && (
                  <Button type="button" size="sm" variant="ghost" loading={pending} onClick={() => run(() => endChallengeAction({ challengeId: ch.id }))}>
                    {t.end}
                  </Button>
                )}
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
