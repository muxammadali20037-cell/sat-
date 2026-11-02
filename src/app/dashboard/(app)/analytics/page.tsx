import type { Metadata } from 'next'
import Link from 'next/link'
import { CircleCheck, Clock3, PenLine } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { analyticsDict } from '@/lib/i18n/dictionaries/analytics'
import { SAT_STRUCTURE } from '@/config/site'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar, StatCard } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import { AccuracyTrendChart, StudyTimeChart, type DailyChartPoint } from '@/components/analytics/daily-charts'
import { SkillAccuracyTable } from '@/components/analytics/skill-table'
import { ScoreTrendChart } from '@/components/analytics/score-trend-chart'
import { loadAnalytics, type FullAnalytics } from '@/features/analytics/server'
import { formatDate, formatInteger, formatStudyDuration, percent } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(analyticsDict)
  return { title: t.metaTitle }
}

type T = (typeof analyticsDict)['en']

const PACING_SECONDS = {
  reading_writing: Math.round((SAT_STRUCTURE.reading_writing.minutes * 60) / SAT_STRUCTURE.reading_writing.questions),
  math: Math.round((SAT_STRUCTURE.math.minutes * 60) / SAT_STRUCTURE.math.questions),
} as const

function FullAnalyticsSections({ t, full, locale, tz, targetScore }: { t: T; full: FullAnalytics; locale: string; tz: string; targetScore: number | null }) {
  const short = { month: 'short', day: 'numeric' } as const
  const points: DailyChartPoint[] = full.daily.map((d) => ({
    date: d.date,
    label: formatDate(d.date, locale, tz, short),
    accuracyPct: d.accuracy === null ? null : Math.round(d.accuracy * 100),
    questions: d.questions,
    correct: d.correct,
    minutes: Math.round(d.studySeconds / 60),
  }))
  const answeredDays = full.daily.filter((d) => d.questions > 0)
  const periodQuestions = answeredDays.reduce((s, d) => s + d.questions, 0)
  const periodCorrect = answeredDays.reduce((s, d) => s + d.correct, 0)
  const studyDays = full.daily.filter((d) => d.studySeconds > 0)
  const periodStudy = studyDays.reduce((s, d) => s + d.studySeconds, 0)
  const lastPractised = Object.fromEntries(
    full.skills.filter((s) => s.lastAnsweredAt).map((s) => [s.skillId, formatDate(s.lastAnsweredAt!, locale, tz)]),
  )
  const mockTrend = full.mocks
    .filter((m) => m.total)
    .map((m) => ({ key: m.attemptId, label: formatDate(m.completedAt, locale, tz, short), ...m.total! }))

  return (
    <>
      <Section title={t.trend.title}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-3 font-sans text-[15px] font-semibold text-foreground">{t.trend.accuracyTitle}</h3>
            {answeredDays.length > 0 ? (
              <AccuracyTrendChart
                points={points}
                summary={format(t.trend.accuracySummary, { days: answeredDays.length, pct: percent(periodCorrect / periodQuestions) })}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t.trend.accuracyNone}</p>
            )}
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-sans text-[15px] font-semibold text-foreground">{t.trend.studyTitle}</h3>
            {studyDays.length > 0 ? (
              <StudyTimeChart
                points={points}
                summary={format(t.trend.studySummary, { total: formatStudyDuration(periodStudy, t.units), days: studyDays.length })}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t.trend.studyNone}</p>
            )}
          </Card>
        </div>
      </Section>

      <Section title={t.skills.title} description={t.skills.description}>
        <SkillAccuracyTable domains={full.domains} skills={full.skills} lastPractised={lastPractised} />
      </Section>

      <Section title={t.time.title} description={t.time.description}>
        {full.timeBySubject.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.time.none}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {full.timeBySubject.map((s) => (
              <StatCard
                key={s.code}
                label={t.subjects[s.code]}
                value={format(t.time.perQuestion, { time: formatStudyDuration(s.avgSeconds, t.units) })}
                hint={`${format(t.time.basis, { n: formatInteger(s.count, locale) })} · ${format(t.time.pacing, { time: formatStudyDuration(PACING_SECONDS[s.code], t.units) })}`}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title={t.diagnostic.title}>
        {full.diagnostics.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {t.diagnostic.empty}
            <Link href="/dashboard/diagnostic" className="font-medium text-primary hover:underline">
              {t.diagnostic.take}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {full.diagnostics.map((d) => (
              <Card key={d.attemptId} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{d.title ?? t.diagnostic.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(d.completedAt, locale, tz)} · {format(t.diagnostic.overall, { correct: d.correct, total: d.total })}
                    </p>
                  </div>
                  <Link href={`/dashboard/results/${d.attemptId}`} className="text-[13px] font-medium text-primary hover:underline">
                    {t.diagnostic.view}
                  </Link>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {d.domains.map((dom) => (
                    <li key={dom.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-foreground">{dom.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular text-muted-foreground">{percent(dom.accuracy)}</span>
                        <Badge variant={dom.level === 'advanced' || dom.level === 'proficient' ? 'primary' : 'neutral'}>{t.diagnostic.levels[dom.level]}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            <p className="text-xs text-muted-foreground">{t.diagnostic.note}</p>
          </div>
        )}
      </Section>

      <Section title={t.mock.title}>
        {full.mocks.length === 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {t.mock.empty}
            <Link href="/dashboard/mock-exams" className="font-medium text-primary hover:underline">
              {t.mock.take}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {mockTrend.length >= 2 && (
              <Card className="p-5">
                <ScoreTrendChart
                  points={mockTrend}
                  target={targetScore}
                  labels={{
                    summary: format(t.mock.chartSummary, {
                      count: mockTrend.length,
                      first: mockTrend[0]!.label,
                      last: mockTrend[mockTrend.length - 1]!.label,
                      from: mockTrend[0]!.mid,
                      to: mockTrend[mockTrend.length - 1]!.mid,
                    }),
                    table: t.mock.chartTable,
                    caption: t.mock.title,
                    date: t.mock.date,
                    range: t.mock.range,
                    midpoint: t.mock.midpoint,
                    target: targetScore !== null ? format(t.mock.target, { n: targetScore }) : null,
                  }}
                />
              </Card>
            )}
            <div className="overflow-x-auto relative rounded-lg border border-border bg-card">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <caption className="sr-only">{t.mock.title}</caption>
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
                    <th scope="col" className="h-10 px-4 text-left font-medium">{t.mock.date}</th>
                    <th scope="col" className="h-10 px-4 text-left font-medium">{t.mock.exam}</th>
                    <th scope="col" className="h-10 px-4 text-right font-medium">{t.mock.rw}</th>
                    <th scope="col" className="h-10 px-4 text-right font-medium">{t.mock.math}</th>
                    <th scope="col" className="h-10 px-4 text-right font-medium">{t.mock.total}</th>
                    <th scope="col" className="h-10 px-4 font-medium"><span className="sr-only">{t.mock.view}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[...full.mocks].reverse().map((m) => (
                    <tr key={m.attemptId} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(m.completedAt, locale, tz)}</td>
                      <td className="px-4 py-3 text-foreground">{m.title ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular">{m.rw ? `${m.rw.low}–${m.rw.high}` : '—'}</td>
                      <td className="px-4 py-3 text-right tabular">{m.math ? `${m.math.low}–${m.math.high}` : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular">{m.total ? `${m.total.low}–${m.total.high}` : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/mock-exams/results/${m.attemptId}`} className="text-[13px] font-medium text-primary hover:underline">
                          {t.mock.view}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{t.mock.note}</p>
          </div>
        )}
      </Section>
    </>
  )
}

export default async function AnalyticsPage() {
  const profile = await requireStudentReady()
  const [t, locale, db] = await Promise.all([getDict(analyticsDict), getLocale(), createServerSupabase()])
  const data = await loadAnalytics(db, createAdminSupabase, profile)
  const tz = profile.timezone || 'Asia/Tashkent'

  if (!data.hasAnyData) {
    return (
      <>
        <PageHeader title={t.title} description={t.description} />
        <EmptyState
          title={t.empty.title}
          description={t.empty.body}
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link href="/dashboard/diagnostic">{t.empty.diagnostic}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/practice">{t.empty.practice}</Link>
              </Button>
            </div>
          }
        />
        {!data.fullEnabled && <UpgradeNotice className="mt-6" title={t.locked.title} description={t.locked.body} actionLabel={t.locked.action} />}
      </>
    )
  }

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className="space-y-10">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label={t.basic.accuracy}
            icon={<CircleCheck />}
            value={data.scored.answered > 0 ? percent(data.scored.accuracy) : null}
            hint={data.scored.answered > 0 ? format(t.basic.accuracyHint, { n: formatInteger(data.scored.answered, locale) }) : t.basic.noData}
          />
          <StatCard label={t.basic.answered} icon={<PenLine />} value={formatInteger(data.scored.answered, locale)} hint={t.basic.answeredHint} />
          <StatCard
            label={t.basic.studyTime}
            icon={<Clock3 />}
            value={data.studySeconds > 0 ? formatStudyDuration(data.studySeconds, t.units) : null}
            hint={t.basic.studyTimeHint}
          />
        </div>

        <Section title={t.basic.subjectTitle}>
          <ul className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
            {data.bySubject.map((s) => (
              <li key={s.code}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-foreground">{t.subjects[s.code]}</span>
                  <span className="font-display text-xl font-semibold tabular text-foreground">{s.tally.answered > 0 ? percent(s.tally.accuracy) : '—'}</span>
                </div>
                {s.tally.answered > 0 ? (
                  <>
                    <ProgressBar
                      value={(s.tally.accuracy ?? 0) * 100}
                      className="mt-2"
                      label={format(t.basic.accuracyLabel, { subject: t.subjects[s.code] })}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{format(t.basic.subjectAnswered, { n: formatInteger(s.tally.answered, locale) })}</p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">{t.basic.notPractised}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>

        {data.full ? (
          <FullAnalyticsSections t={t} full={data.full} locale={locale} tz={tz} targetScore={profile.targetScore} />
        ) : (
          <UpgradeNotice title={t.locked.title} description={t.locked.body} actionLabel={t.locked.action} />
        )}
      </div>
    </>
  )
}
