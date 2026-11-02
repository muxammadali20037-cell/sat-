import type { Metadata } from 'next'
import Link from 'next/link'
import { Activity, BarChart3, CreditCard, GraduationCap, Layers, Target, TrendingUp, UserPlus } from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Alert } from '@/components/ui/card'
import { StatCard } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { Panel } from '@/components/admin/metric-card'
import { CategoryBarChart, ColumnSeriesChart, LineSeriesChart, RevenueChart } from '@/components/admin/charts'
import { loadAnalytics } from '@/features/admin/metrics'
import { seriesTotal } from '@/features/admin/series'
import { excerpt } from '@/features/admin/format'
import { formatNumber, formatPercent } from '@/lib/utils'

export const metadata: Metadata = { title: 'Analytics' }

const LEVEL_LABELS: Record<string, string> = { foundation: 'Foundation', developing: 'Developing', proficient: 'Proficient', advanced: 'Advanced' }

export default async function AnalyticsPage() {
  await requireRole(ADMIN_ROLES, { next: '/admin/analytics' })
  const db = await createServerSupabase()
  const a = await loadAnalytics(db)
  const registrations12w = seriesTotal(a.registrationsPerWeek)
  const questions30d = seriesTotal(a.questionsPerDay)
  const completions12w = seriesTotal(a.lessonCompletionsPerWeek)
  const lastWeekActive = a.activeStudentsPerWeek.at(-1)?.value ?? 0

  return (
    <>
      <PageHeader title="Analytics" description="Growth, engagement, revenue and content difficulty from live data. Weeks start on Monday (Asia/Tashkent)." />
      {a.truncated.length > 0 && (
        <Alert variant="warning" className="mb-4" title="Some charts use a capped sample">
          Very large tables were read up to 50,000 rows: {a.truncated.join(', ')}.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Registrations (12 weeks)" value={formatNumber(registrations12w)} />
        <StatCard label="Active students (this week)" value={formatNumber(lastWeekActive)} hint="Answered a question or completed a lesson" />
        <StatCard label="Questions answered (30 days)" value={formatNumber(questions30d)} />
        <StatCard
          label="Free → paid conversion"
          value={a.conversion.rate === null ? null : formatPercent(a.conversion.rate, 1)}
          hint={a.conversion.students === 0 ? 'No students yet' : `${formatNumber(a.conversion.payingStudents)} of ${formatNumber(a.conversion.students)} students have a succeeded payment`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel icon={<UserPlus />} title="Registrations per week" description="New student accounts, last 12 weeks">
          <ColumnSeriesChart points={a.registrationsPerWeek} ariaLabel="Registrations per week" valueLabel="Registrations" periodLabel="Week" empty={{ title: 'No registrations in the last 12 weeks' }} />
        </Panel>
        <Panel icon={<Activity />} title="Active students per week" description="Students who answered a question or completed a lesson">
          <ColumnSeriesChart points={a.activeStudentsPerWeek} ariaLabel="Active students per week" valueLabel="Active students" periodLabel="Week" empty={{ title: 'No student activity in the last 12 weeks' }} />
        </Panel>
        <Panel icon={<BarChart3 />} title="Questions answered per day" description="All attempt kinds, last 30 days">
          <LineSeriesChart points={a.questionsPerDay} ariaLabel="Questions answered per day" valueLabel="Questions" periodLabel="Day" empty={{ title: 'No questions answered in the last 30 days' }} />
        </Panel>
        <Panel icon={<GraduationCap />} title="Lesson completions per week" description={`${formatNumber(completions12w)} in the last 12 weeks`}>
          <ColumnSeriesChart points={a.lessonCompletionsPerWeek} ariaLabel="Lesson completions per week" valueLabel="Completions" periodLabel="Week" empty={{ title: 'No lessons completed in the last 12 weeks' }} />
        </Panel>
        <Panel icon={<TrendingUp />} title="Revenue per month" description="Succeeded payments, last 12 months, per currency" className="lg:col-span-2">
          <RevenueChart series={a.revenuePerMonth} periodLabel="Last 12 months" empty={{ title: 'No paid payments in the last 12 months', description: 'Revenue appears once a payment succeeds.' }} />
        </Panel>
        <Panel icon={<CreditCard />} title="Plan distribution" description="Active subscriptions (including grace period) per plan">
          <CategoryBarChart
            data={a.planDistribution.map((p) => ({ label: p.plan, value: p.count }))}
            ariaLabel="Active subscriptions per plan"
            valueLabel="Subscriptions"
            categoryLabel="Plan"
            empty={{ title: 'No active paid subscriptions', description: 'Students on the free plan are not counted here.' }}
          />
        </Panel>
        <Panel icon={<Layers />} title="Diagnostic levels" description="Per-domain results from diagnostics in the last 12 months (SAT MASTER internal bands)">
          <CategoryBarChart
            data={a.diagnosticLevels.map((l) => ({ label: LEVEL_LABELS[l.level] ?? l.level, value: l.count }))}
            ariaLabel="Diagnostic level distribution"
            valueLabel="Domain results"
            categoryLabel="Level"
            empty={{ title: 'No completed diagnostics yet' }}
          />
        </Panel>
      </div>

      <Panel
        className="mt-4"
        icon={<Target />}
        title="Hardest published questions"
        description={`Lowest accuracy with at least 5 scored answers · based on ${formatNumber(a.hardestSample.answers)} answers from the last ${a.hardestSample.days} days${a.hardestSample.truncated ? ' (most recent 30,000)' : ''}`}
        bodyClassName="p-0"
      >
        {a.hardestQuestions.length === 0 ? (
          <EmptyState className="m-4" title="Not enough answers yet" description="Questions appear here once they have at least 5 scored answers." />
        ) : (
          <div className="overflow-x-auto relative">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Hardest published questions</caption>
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  {['Question', 'Skill', 'Answers', 'Accuracy'].map((h, i) => (
                    <th key={h} scope="col" className={`h-10 px-4 text-xs font-medium text-muted-foreground ${i >= 2 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.hardestQuestions.map((q) => (
                  <tr key={q.id} className="border-b border-border last:border-0">
                    <td className="max-w-md px-4 py-2.5">
                      <Link href={`/admin/questions/${q.id}`} className="hover:underline">
                        {excerpt(q.stem, 100)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{q.skillName}</td>
                    <td className="px-4 py-2.5 text-right tabular">{formatNumber(q.answered)}</td>
                    <td className="px-4 py-2.5 text-right tabular font-medium">{formatPercent(q.accuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
