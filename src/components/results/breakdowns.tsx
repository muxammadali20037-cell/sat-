import Link from 'next/link'
import { format } from '@/lib/i18n/dict'
import { formatPercent } from '@/lib/utils'
import { Badge } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import type { LevelBand } from '@/lib/scoring'

export const LEVEL_TONE: Record<LevelBand, 'destructive' | 'warning' | 'primary' | 'success'> = {
  foundation: 'destructive',
  developing: 'warning',
  proficient: 'primary',
  advanced: 'success',
}

type SkillRow = { skillId: string; skillName: string; domainName: string; correct: number; total: number; accuracy: number | null }

/** Per-skill correct/total bars. Accuracy text accompanies every bar (colour is never the only signal). */
export function SkillBreakdown({ rows, rowLabel }: { rows: SkillRow[]; rowLabel: string }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((s) => (
        <li key={s.skillId} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{s.skillName}</p>
            <p className="truncate text-xs text-muted-foreground">{s.domainName}</p>
          </div>
          <div className="flex items-center gap-3">
            <ProgressBar
              size="sm"
              value={s.correct}
              max={s.total}
              label={`${s.skillName}: ${format(rowLabel, { correct: s.correct, total: s.total })}`}
              tone={s.accuracy !== null && s.accuracy >= 0.6 ? 'success' : s.accuracy !== null && s.accuracy >= 0.4 ? 'warning' : 'destructive'}
            />
            <span className="w-24 shrink-0 text-right text-[13px] tabular">
              {format(rowLabel, { correct: s.correct, total: s.total })}
              <span className="ml-1 text-muted-foreground">{formatPercent(s.accuracy)}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

type DomainRow = { domainId: string; domainName: string; correct: number; total: number; accuracy: number; level: LevelBand }

export function DomainLevels({ rows, levelLabels, rowLabel }: { rows: DomainRow[]; levelLabels: Record<LevelBand, string>; rowLabel: string }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.map((d) => (
        <li key={d.domainId} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{d.domainName}</p>
            <Badge variant={LEVEL_TONE[d.level]}>{levelLabels[d.level]}</Badge>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold tabular">{formatPercent(d.accuracy)}</p>
          <p className="text-[13px] text-muted-foreground tabular">{format(rowLabel, { correct: d.correct, total: d.total })}</p>
          <ProgressBar className="mt-3" size="sm" value={d.accuracy * 100} label={`${d.domainName} ${formatPercent(d.accuracy)}`} />
        </li>
      ))}
    </ul>
  )
}

export function WeakSkillList({
  rows,
  practiseLabel,
  rowLabel,
  hrefFor,
}: {
  rows: Array<SkillRow & { domainId: string }>
  practiseLabel: string
  rowLabel: string
  hrefFor: (row: SkillRow & { domainId: string }) => string
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {rows.map((s) => (
        <li key={s.skillId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">{s.skillName}</p>
            <p className="text-[13px] text-muted-foreground tabular">
              {s.domainName} · {format(rowLabel, { correct: s.correct, total: s.total })} · {formatPercent(s.accuracy)}
            </p>
          </div>
          <Link href={hrefFor(s)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {practiseLabel}
          </Link>
        </li>
      ))}
    </ul>
  )
}
