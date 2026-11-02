'use client'

import * as React from 'react'

/**
 * Chart styling from design tokens (CSS variables resolve per theme, so light/dark both work).
 * Single-series charts use slot 1 (`--primary`); text never wears the series color.
 */
export const CHART = {
  series: 'var(--primary)',
  band: 'var(--primary)',
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)',
  reference: 'var(--muted-foreground)',
  surface: 'var(--card)',
  tick: { fill: 'var(--muted-foreground)', fontSize: 12 },
} as const

type TooltipEntry = { value?: unknown; name?: unknown; dataKey?: unknown; payload?: Record<string, unknown> }

/** Token-styled tooltip body; `render` receives the hovered datum. */
export function ChartTooltip<T>({
  active,
  payload,
  render,
}: {
  active?: boolean
  payload?: ReadonlyArray<TooltipEntry>
  render: (datum: T) => React.ReactNode
}) {
  if (!active || !payload || payload.length === 0) return null
  const datum = payload[0]?.payload as T | undefined
  if (!datum) return null
  return <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay">{render(datum)}</div>
}

/** "Show as table" disclosure: the accessible equivalent of every chart. */
export function ChartTable({
  summary,
  caption,
  headers,
  rows,
}: {
  summary: string
  caption: string
  headers: string[]
  rows: Array<Array<React.ReactNode>>
}) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer select-none text-[13px] font-medium text-primary hover:underline">{summary}</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted">
            <tr>
              {headers.map((h, i) => (
                <th key={h} scope="col" className={i === 0 ? 'px-3 py-2 text-left font-medium text-muted-foreground' : 'px-3 py-2 text-right font-medium text-muted-foreground'}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((cell, j) => (
                  <td key={j} className={j === 0 ? 'px-3 py-1.5 text-left' : 'px-3 py-1.5 text-right tabular'}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
