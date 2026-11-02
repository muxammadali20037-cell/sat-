'use client'

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDict } from '@/lib/i18n/client'
import { analyticsDict } from '@/lib/i18n/dictionaries/analytics'
import { CHART, ChartTable, ChartTooltip } from './chart-parts'

export type DailyChartPoint = {
  date: string
  /** Pre-formatted on the server (avoids locale hydration differences). */
  label: string
  accuracyPct: number | null
  questions: number
  correct: number
  minutes: number
}

const axisProps = {
  tick: CHART.tick,
  tickLine: false,
} as const

/** Daily accuracy over the last 30 days. Days without answers are gaps, not zeros. */
export function AccuracyTrendChart({ points, summary }: { points: DailyChartPoint[]; summary: string }) {
  const t = useDict(analyticsDict)
  return (
    <figure>
      <div aria-hidden className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} {...axisProps} axisLine={false} width={48} />
            <Line
              dataKey="accuracyPct"
              stroke={CHART.series}
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 4, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Tooltip
              cursor={{ stroke: CHART.grid }}
              content={(props) => (
                <ChartTooltip<DailyChartPoint>
                  active={props.active}
                  payload={props.payload as never}
                  render={(d) => (
                    <>
                      <p className="font-medium">{d.label}</p>
                      <p className="tabular">
                        {d.accuracyPct === null ? t.trend.noAnswers : `${t.trend.accuracy}: ${d.accuracyPct}% (${d.correct}/${d.questions})`}
                      </p>
                    </>
                  )}
                />
              )}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-[13px] text-muted-foreground">{summary}</figcaption>
      <ChartTable
        summary={t.trend.table}
        caption={t.trend.accuracyTitle}
        headers={[t.trend.date, t.trend.answered, t.trend.accuracy, t.trend.minutes]}
        rows={points
          .filter((p) => p.questions > 0 || p.minutes > 0)
          .map((p) => [p.label, p.questions, p.accuracyPct === null ? '—' : `${p.accuracyPct}%`, p.minutes])}
      />
    </figure>
  )
}

/** Minutes of study per day over the last 30 days. */
export function StudyTimeChart({ points, summary }: { points: DailyChartPoint[]; summary: string }) {
  const t = useDict(analyticsDict)
  return (
    <figure>
      <div aria-hidden className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" {...axisProps} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} {...axisProps} axisLine={false} width={48} />
            <Bar dataKey="minutes" fill={CHART.series} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Tooltip
              cursor={{ fill: 'var(--muted)' }}
              content={(props) => (
                <ChartTooltip<DailyChartPoint>
                  active={props.active}
                  payload={props.payload as never}
                  render={(d) => (
                    <>
                      <p className="font-medium">{d.label}</p>
                      <p className="tabular">
                        {t.trend.minutes}: {d.minutes}
                      </p>
                    </>
                  )}
                />
              )}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-[13px] text-muted-foreground">{summary}</figcaption>
    </figure>
  )
}
