'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/**
 * Single-series daily column chart for the admin AI usage page (one measure per chart — requests
 * and cost are separate charts, never a dual axis). Hover/focus tooltip per column; the same values
 * are available in the table under each chart.
 */
export function DailyUsageChart({
  data,
  label,
  valueFormat = 'count',
}: {
  data: { date: string; value: number }[]
  label: string
  valueFormat?: 'count' | 'usd'
}) {
  const fmt = (v: number) =>
    valueFormat === 'usd'
      ? `$${v.toLocaleString('en-US', { minimumFractionDigits: v !== 0 && v < 1 ? 4 : 2, maximumFractionDigits: v !== 0 && v < 1 ? 4 : 2 })}`
      : v.toLocaleString('en-US')
  const axisFmt = (v: number) =>
    valueFormat === 'usd'
      ? `$${v >= 1000 ? `${Math.round(v / 1000)}K` : v < 1 && v > 0 ? v.toFixed(2) : Math.round(v)}`
      : v >= 10_000
        ? `${Math.round(v / 1000)}K`
        : v.toLocaleString('en-US')
  const rows = data.map((d) => ({ ...d, label: d.date.slice(5) }))

  return (
    <div className="h-56 w-full" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            interval="preserveStartEnd"
            minTickGap={12}
          />
          <YAxis
            allowDecimals={valueFormat === 'usd'}
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            tickFormatter={axisFmt}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { date: string; value: number } | undefined
              if (!active || !p) return null
              return (
                <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-overlay">
                  <p className="font-semibold tabular text-foreground">{fmt(p.value)}</p>
                  <p className="text-xs text-muted-foreground">{p.date}</p>
                </div>
              )
            }}
          />
          <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
