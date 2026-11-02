'use client'

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART, ChartTable, ChartTooltip } from './chart-parts'

export type ScoreTrendPoint = { key: string; label: string; low: number; high: number; mid: number }

type Datum = ScoreTrendPoint & { band: [number, number] }

/**
 * Total SAT MASTER estimate over time: the range as a light band, the midpoint as the line,
 * the student's target as a reference rule. Accessible summary + table below the chart.
 */
export function ScoreTrendChart({
  points,
  target,
  labels,
  height = 220,
}: {
  points: ScoreTrendPoint[]
  target: number | null
  labels: { summary: string; table: string; caption: string; date: string; range: string; midpoint: string; target: string | null }
  height?: number
}) {
  const data: Datum[] = points.map((p) => ({ ...p, band: [p.low, p.high] }))
  return (
    <figure>
      <div aria-hidden style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: -12 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" tick={CHART.tick} tickLine={false} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis domain={[400, 1600]} ticks={[400, 800, 1200, 1600]} tick={CHART.tick} tickLine={false} axisLine={false} width={48} />
            {target !== null && (
              <ReferenceLine
                y={target}
                stroke={CHART.reference}
                strokeWidth={1}
                label={labels.target ? { value: labels.target, position: 'insideTopRight', fill: 'var(--foreground)', fontSize: 12 } : undefined}
              />
            )}
            <Area dataKey="band" stroke="none" fill={CHART.band} fillOpacity={0.12} isAnimationActive={false} />
            <Line
              dataKey="mid"
              stroke={CHART.series}
              strokeWidth={2}
              dot={{ r: 4, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Tooltip
              cursor={{ stroke: CHART.grid }}
              content={(props) => (
                <ChartTooltip<Datum>
                  active={props.active}
                  payload={props.payload as never}
                  render={(d) => (
                    <>
                      <p className="font-medium">{d.label}</p>
                      <p className="tabular">
                        {labels.range}: {d.low}–{d.high}
                      </p>
                      <p className="tabular">
                        {labels.midpoint}: {d.mid}
                      </p>
                    </>
                  )}
                />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-[13px] text-muted-foreground">{labels.summary}</figcaption>
      <ChartTable
        summary={labels.table}
        caption={labels.caption}
        headers={[labels.date, labels.range, labels.midpoint]}
        rows={points.map((p) => [p.label, `${p.low}–${p.high}`, p.mid])}
      />
    </figure>
  )
}
