import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * KPI tile for the admin overview: icon + label + large value, and a footer row of 1–3
 * sub-metrics. Border-separated (no shadow). `value=null` renders "—" with the hint.
 */
export function MetricCard({
  icon,
  label,
  value,
  hint,
  sub,
  href,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode | null
  hint?: React.ReactNode
  sub?: Array<{ label: string; value: React.ReactNode; tone?: 'default' | 'warning' | 'destructive' | 'success' }>
  href?: string
  className?: string
}) {
  const toneCls = { default: 'text-foreground', warning: 'text-warning-foreground', destructive: 'text-destructive', success: 'text-success' }
  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card', className)}>
      <div className="flex items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary [&_svg]:size-5" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] text-muted-foreground">{label}</p>
            {href && (
              <Link href={href} className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Open ${label.toLowerCase()}`}>
                <ArrowUpRight className="size-4" />
              </Link>
            )}
          </div>
          <p className="mt-0.5 font-display text-2xl font-semibold tabular text-foreground">{value ?? '—'}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {sub && sub.length > 0 && (
        <dl className="mt-auto flex divide-x divide-border border-t border-border bg-muted/40 text-[13px]">
          {sub.map((s) => (
            <div key={s.label} className="flex min-w-0 flex-1 items-baseline justify-between gap-2 px-4 py-2.5">
              <dt className="truncate text-muted-foreground">{s.label}</dt>
              <dd className={cn('font-semibold tabular', toneCls[s.tone ?? 'default'])}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Bordered panel with an icon, a title, optional controls and a "See all" link. */
export function Panel({
  icon,
  title,
  description,
  controls,
  seeAllHref,
  seeAllLabel = 'See all',
  children,
  className,
  bodyClassName,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  controls?: React.ReactNode
  seeAllHref?: string
  seeAllLabel?: string
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-card', className)} aria-label={title}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:size-4" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {controls}
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border-strong px-2.5 text-[13px] font-medium hover:bg-muted"
          >
            {seeAllLabel} <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>
      <div className={cn('flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Link-based segmented control (works without JavaScript; state lives in the URL). */
export function SegmentedLinks({
  label,
  options,
  value,
  hrefFor,
}: {
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  value: string
  hrefFor: (value: string) => string
}) {
  return (
    <nav aria-label={label} className="inline-flex rounded-md border border-border-strong p-0.5">
      {options.map((o) => {
        const active = o.value === value
        return (
          <Link
            key={o.value}
            href={hrefFor(o.value)}
            scroll={false}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'inline-flex h-7 items-center whitespace-nowrap rounded-[5px] px-2.5 text-[13px] transition-colors',
              active ? 'bg-primary-soft font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </Link>
        )
      })}
    </nav>
  )
}
