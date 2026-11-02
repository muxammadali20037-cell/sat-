import * as React from 'react'
import { cn } from '@/lib/utils'

type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'navy'
const toneBg: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  navy: 'bg-navy-900 dark:bg-accent',
}
const toneStroke: Record<Tone, string> = {
  primary: 'stroke-primary',
  success: 'stroke-success',
  warning: 'stroke-warning',
  destructive: 'stroke-destructive',
  navy: 'stroke-navy-900 dark:stroke-accent',
}

export function ProgressBar({
  value,
  max = 100,
  label,
  tone = 'primary',
  className,
  size = 'md',
}: {
  value: number
  max?: number
  label: string
  tone?: Tone
  className?: string
  size?: 'sm' | 'md'
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn('w-full overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2', className)}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-300', toneBg[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function CircularProgress({
  value,
  max = 100,
  size = 72,
  stroke = 7,
  label,
  tone = 'primary',
  children,
  className,
}: {
  value: number
  max?: number
  size?: number
  stroke?: number
  label: string
  tone?: Tone
  children?: React.ReactNode
  className?: string
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cn('transition-[stroke-dashoffset] duration-500', toneStroke[tone])}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular">{children}</div>
    </div>
  )
}

/** KPI tile. Pass value=null for "no data yet" with an explanation instead of a fake number. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string
  value: React.ReactNode | null
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular text-foreground">{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
