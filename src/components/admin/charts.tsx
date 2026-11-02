'use client'

import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3 } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'

/**
 * Admin charts. One series per chart in the primary hue (no categorical palette needed);
 * currencies are never mixed in one chart. Every chart ships a data table for screen readers
 * and keyboard users, and an honest empty state when all values are zero.
 */

export type ChartPoint = { key: string; label: string; fullLabel: string; value: number }
export type ValueFormat = { kind: 'number' } | { kind: 'money'; currency: string } | { kind: 'percent' }

function formatter(f: ValueFormat): (v: number) => string {
  if (f.kind === 'money') return (v) => formatMoney(v, f.currency, 'en')
  if (f.kind === 'percent') return (v) => `${Math.round(v * 100)}%`
  return (v) => new Intl.NumberFormat('en-US').format(v)
}

function axisFormatter(f: ValueFormat): (v: number) => string {
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  if (f.kind === 'money') return (v) => compact.format(v / 100)
  if (f.kind === 'percent') return (v) => `${Math.round(v * 100)}%`
  return (v) => (Math.abs(v) >= 10_000 ? compact.format(v) : new Intl.NumberFormat('en-US').format(v))
}

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }

type TooltipLike = { active?: boolean; payload?: Array<{ payload?: { fullLabel?: string; label?: string; value?: number } }> }

function TooltipBox({ props, valueLabel, fmt }: { props: TooltipLike; valueLabel: string; fmt: (v: number) => string }) {
  if (!props.active || !props.payload?.length) return null
  const p = props.payload[0]?.payload
  if (!p) return null
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">
      <p className="font-medium">{p.fullLabel ?? p.label}</p>
      <p className="mt-0.5 text-muted-foreground">
        {valueLabel}: <span className="font-semibold tabular text-foreground">{fmt(p.value ?? 0)}</span>
      </p>
    </div>
  )
}

export function ChartEmpty({ title, description, className }: { title: string; description?: string; className?: string }) {
  return (
    <div className={cn('flex h-full min-h-48 flex-col items-center justify-center rounded-md border border-dashed border-border-strong px-6 text-center', className)}>
      <BarChart3 className="mb-2 size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">{description}</p>}
    </div>
  )
}

/** Collapsible data table that mirrors the chart (accessibility + exact values). */
export function ChartDataTable({
  caption,
  labelHeader,
  valueHeader,
  rows,
}: {
  caption: string
  labelHeader: string
  valueHeader: string
  rows: Array<{ key: string; label: string; value: string }>
}) {
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Show data table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th scope="col" className="px-3 py-1.5 text-left font-medium text-muted-foreground">
                {labelHeader}
              </th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium text-muted-foreground">
                {valueHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-1.5">{r.label}</td>
                <td className="px-3 py-1.5 text-right tabular">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

type SeriesChartProps = {
  points: ChartPoint[]
  ariaLabel: string
  valueLabel: string
  periodLabel?: string
  format?: ValueFormat
  height?: number
  empty: { title: string; description?: string }
  showTable?: boolean
}

/** Change over time: 2px line with a 10% area wash, crosshair tooltip. */
export function LineSeriesChart({ points, ariaLabel, valueLabel, periodLabel = 'Period', format = { kind: 'number' }, height = 240, empty, showTable = true }: SeriesChartProps) {
  const fmt = formatter(format)
  const hasData = points.some((p) => p.value !== 0)
  return (
    <figure aria-label={ariaLabel} className="min-w-0">
      {hasData ? (
        <div style={{ height }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={18} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} allowDecimals={false} tickFormatter={axisFormatter(format)} />
              <Tooltip cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} content={(p) => <TooltipBox props={p as unknown as TooltipLike} valueLabel={valueLabel} fmt={fmt} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="var(--primary)"
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--primary)', stroke: 'var(--card)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height }}>
          <ChartEmpty title={empty.title} description={empty.description} />
        </div>
      )}
      {showTable && hasData && (
        <ChartDataTable
          caption={ariaLabel}
          labelHeader={periodLabel}
          valueHeader={valueLabel}
          rows={points.map((p) => ({ key: p.key, label: p.fullLabel, value: fmt(p.value) }))}
        />
      )}
    </figure>
  )
}

/** Magnitude per period: columns ≤ 24px, 4px rounded data ends, hover tooltip. */
export function ColumnSeriesChart({ points, ariaLabel, valueLabel, periodLabel = 'Period', format = { kind: 'number' }, height = 240, empty, showTable = true }: SeriesChartProps) {
  const fmt = formatter(format)
  const hasData = points.some((p) => p.value !== 0)
  return (
    <figure aria-label={ariaLabel} className="min-w-0">
      {hasData ? (
        <div style={{ height }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--border)' }} minTickGap={12} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} allowDecimals={false} tickFormatter={axisFormatter(format)} />
              <Tooltip cursor={{ fill: 'var(--muted)' }} content={(p) => <TooltipBox props={p as unknown as TooltipLike} valueLabel={valueLabel} fmt={fmt} />} />
              <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height }}>
          <ChartEmpty title={empty.title} description={empty.description} />
        </div>
      )}
      {showTable && hasData && (
        <ChartDataTable
          caption={ariaLabel}
          labelHeader={periodLabel}
          valueHeader={valueLabel}
          rows={points.map((p) => ({ key: p.key, label: p.fullLabel, value: fmt(p.value) }))}
        />
      )}
    </figure>
  )
}

/** Category comparison (plans, levels): horizontal bars with the value at the tip. */
export function CategoryBarChart({
  data,
  ariaLabel,
  valueLabel,
  categoryLabel,
  format = { kind: 'number' },
  empty,
  showTable = true,
}: {
  data: Array<{ label: string; value: number }>
  ariaLabel: string
  valueLabel: string
  categoryLabel: string
  format?: ValueFormat
  empty: { title: string; description?: string }
  showTable?: boolean
}) {
  const fmt = formatter(format)
  const hasData = data.some((d) => d.value !== 0)
  const points = data.map((d) => ({ ...d, key: d.label, fullLabel: d.label }))
  const height = Math.max(120, data.length * 40 + 24)
  return (
    <figure aria-label={ariaLabel} className="min-w-0">
      {hasData ? (
        <div style={{ height }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 0 }} barCategoryGap="30%">
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={axisFormatter(format)} />
              <YAxis type="category" dataKey="label" tick={{ ...AXIS_TICK, fill: 'var(--foreground)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} width={112} />
              <Tooltip cursor={{ fill: 'var(--muted)' }} content={(p) => <TooltipBox props={p as unknown as TooltipLike} valueLabel={valueLabel} fmt={fmt} />} />
              <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
                <LabelList dataKey="value" position="right" formatter={(v: unknown) => fmt(Number(v))} style={{ fill: 'var(--foreground)', fontSize: 12 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height: 180 }}>
          <ChartEmpty title={empty.title} description={empty.description} />
        </div>
      )}
      {showTable && hasData && (
        <ChartDataTable caption={ariaLabel} labelHeader={categoryLabel} valueHeader={valueLabel} rows={points.map((p) => ({ key: p.key, label: p.label, value: fmt(p.value) }))} />
      )}
    </figure>
  )
}

export type CurrencySeriesData = { currency: string; totalMinor: number; count: number; points: ChartPoint[] }

/**
 * Revenue per currency. Each currency has its own chart (never summed across currencies); a
 * switch appears only when payments exist in more than one currency.
 */
export function RevenueChart({
  series,
  periodLabel,
  height = 260,
  empty,
}: {
  series: CurrencySeriesData[]
  periodLabel: string
  height?: number
  empty: { title: string; description?: string }
}) {
  const [currency, setCurrency] = React.useState(series[0]?.currency ?? 'UZS')
  const active = series.find((s) => s.currency === currency) ?? series[0]
  if (!active) {
    return (
      <div style={{ height }}>
        <ChartEmpty title={empty.title} description={empty.description} />
      </div>
    )
  }
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-semibold tabular">{formatMoney(active.totalMinor, active.currency, 'en')}</p>
          <p className="text-[13px] text-muted-foreground">
            {active.count} paid payment{active.count === 1 ? '' : 's'} · {periodLabel.toLowerCase()} · refunds and pending payments excluded
          </p>
        </div>
        {series.length > 1 && (
          <div role="group" aria-label="Currency" className="inline-flex rounded-md border border-border-strong p-0.5">
            {series.map((s) => (
              <button
                key={s.currency}
                type="button"
                onClick={() => setCurrency(s.currency)}
                aria-pressed={s.currency === active.currency}
                className={cn(
                  'h-7 rounded-[5px] px-2.5 text-[13px]',
                  s.currency === active.currency ? 'bg-primary-soft font-medium text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.currency}
              </button>
            ))}
          </div>
        )}
      </div>
      <LineSeriesChart
        points={active.points}
        ariaLabel={`Revenue in ${active.currency}, ${periodLabel.toLowerCase()}`}
        valueLabel={`Revenue (${active.currency})`}
        format={{ kind: 'money', currency: active.currency }}
        height={height}
        empty={empty}
      />
    </div>
  )
}
