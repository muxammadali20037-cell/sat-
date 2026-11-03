import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  FileQuestion,
  GraduationCap,
  History,
  Library,
  PenLine,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_ROLES, STAFF_ROLES, hasRole } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { EnvProblemsAlert } from '@/components/admin/env-problems'
import { serverEnvProblems } from '@/lib/env'
import { StatCard } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { MetricCard, Panel, SegmentedLinks } from '@/components/admin/metric-card'
import { CategoryBarChart, RevenueChart } from '@/components/admin/charts'
import { ContentStatusBadge, PaymentStatusBadge, QuestionStatusBadge } from '@/components/admin/status-badge'
import {
  courseStatusCounts,
  getDashboardMetrics,
  lessonStatusCounts,
  planSalesFor,
  questionStatusCounts,
  recentAuditActivity,
  recentPayments,
  recentlyEdited,
  revenueSeriesFor,
  reviewQueue,
  subscriptionsExpiringSoon,
  topCourses,
  type ContentItem,
} from '@/features/admin/metrics'
import { REVENUE_PERIODS, isRevenuePeriod, type RevenuePeriod } from '@/features/admin/series'
import { buildHref, param } from '@/features/admin/params'
import { excerpt, formatUsdMicros, money, timeAgo } from '@/features/admin/format'
import { formatNumber } from '@/lib/utils'

export const metadata: Metadata = { title: 'Admin overview' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const n = (v: number) => formatNumber(v)

export default async function AdminOverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireRole(STAFF_ROLES, { next: '/admin' })
  const sp = await searchParams
  const db = await createServerSupabase()
  const firstName = profile.fullName.split(' ')[0] || 'there'

  if (!hasRole(profile.role, ADMIN_ROLES)) {
    return <ContentOverview db={db} greeting={`Welcome back, ${firstName}`} canEdit={profile.role !== 'TEACHER'} />
  }

  const rev: RevenuePeriod = isRevenuePeriod(param(sp.rev)) ? (param(sp.rev) as RevenuePeriod) : 'year'
  const sales: RevenuePeriod = isRevenuePeriod(param(sp.sales)) ? (param(sp.sales) as RevenuePeriod) : '6m'
  const hrefWith = (key: 'rev' | 'sales', value: string) => buildHref('/admin', { rev: key === 'rev' ? value : rev, sales: key === 'sales' ? value : sales })

  const [metrics, qCounts, lCounts, expiring, revenue, planSales, payments, courses, activity, queue] = await Promise.all([
    getDashboardMetrics(db),
    questionStatusCounts(db),
    lessonStatusCounts(db),
    subscriptionsExpiringSoon(db, 7),
    revenueSeriesFor(db, rev),
    planSalesFor(db, sales),
    recentPayments(db, 6),
    topCourses(db, 5),
    recentAuditActivity(db, 8),
    reviewQueue(db, 5),
  ])
  const revLabel = REVENUE_PERIODS.find((p) => p.value === rev)!.label
  const salesLabel = REVENUE_PERIODS.find((p) => p.value === sales)!.label

  return (
    <>
      <PageHeader title="Overview" description={`Welcome back, ${firstName}. Every number here comes from live data.`} />
      <EnvProblemsAlert problems={serverEnvProblems()} className="mb-6" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Users />}
          label="Students"
          value={n(metrics.total_students)}
          href="/admin/students"
          sub={[
            { label: 'Active 7d', value: n(metrics.active_students_7d) },
            { label: 'New 30d', value: n(metrics.new_students_30d) },
          ]}
        />
        <MetricCard
          icon={<FileQuestion />}
          label="Published questions"
          value={n(metrics.published_questions)}
          href="/admin/questions"
          sub={[
            { label: 'In review', value: n(metrics.questions_awaiting_review), tone: metrics.questions_awaiting_review > 0 ? 'warning' : 'default' },
            { label: 'Reviewed', value: n(qCounts.reviewed) },
          ]}
        />
        <MetricCard
          icon={<BookOpen />}
          label="Published lessons"
          value={n(metrics.published_lessons)}
          href="/admin/lessons"
          sub={[
            { label: 'Draft', value: n(lCounts.draft) },
            { label: 'Archived', value: n(lCounts.archived) },
          ]}
        />
        <MetricCard
          icon={<CreditCard />}
          label="Active subscriptions"
          value={n(metrics.active_subscriptions)}
          hint="Includes subscriptions in their grace period"
          sub={[
            { label: 'Expiring 7d', value: n(expiring), tone: expiring > 0 ? 'warning' : 'default' },
            { label: 'Canceled 30d', value: n(metrics.cancellations_30d) },
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="MRR (UZS plans)" value={money(metrics.mrr_minor_uzs, 'UZS')} hint="Monthly price of active UZS subscriptions" />
        <StatCard
          label="Paid in last 30 days"
          value={money(metrics.payments_minor_uzs_30d, 'UZS')}
          hint={`${n(metrics.payments_count_30d)} succeeded payment${metrics.payments_count_30d === 1 ? '' : 's'} (UZS)`}
        />
        <StatCard label="Failed payments (30d)" value={n(metrics.failed_payments_30d)} hint="Failed payments never change access" />
        <StatCard label="New students (7d)" value={n(metrics.new_students_7d)} hint={`${n(metrics.new_students_30d)} in the last 30 days`} />
        <StatCard label="Questions answered (7d)" value={n(metrics.questions_answered_7d)} hint="All practice, diagnostic and exam answers" />
        <StatCard label="Lessons completed (7d)" value={n(metrics.lessons_completed_7d)} />
        <StatCard label="Mock exams completed (30d)" value={n(metrics.mock_exams_completed_30d)} />
        <StatCard
          label="AI tutor requests (7d)"
          value={n(metrics.ai_requests_7d)}
          hint={`AI cost last 30 days: ${formatUsdMicros(metrics.ai_cost_micros_30d)}`}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          icon={<TrendingUp />}
          title="Revenue"
          description="Succeeded payments, by the date they were paid (Asia/Tashkent)"
          controls={<SegmentedLinks label="Revenue period" options={REVENUE_PERIODS} value={rev} hrefFor={(v) => hrefWith('rev', v)} />}
        >
          <RevenueChart
            key={rev}
            series={revenue.series}
            periodLabel={revLabel}
            empty={{ title: 'No paid payments in this period', description: 'Revenue appears here once a payment succeeds.' }}
          />
          {revenue.truncated && <p className="mt-2 text-xs text-warning-foreground">Showing the first 50,000 payments of this period.</p>}
        </Panel>
        <Panel
          icon={<ShoppingBag />}
          title="Plan sales"
          description="Succeeded payments per plan"
          controls={<SegmentedLinks label="Plan sales period" options={REVENUE_PERIODS} value={sales} hrefFor={(v) => hrefWith('sales', v)} />}
        >
          <CategoryBarChart
            data={planSales.map((p) => ({ label: p.plan, value: p.count }))}
            ariaLabel={`Plan sales, ${salesLabel.toLowerCase()}`}
            valueLabel="Payments"
            categoryLabel="Plan"
            empty={{ title: 'No plan sales in this period', description: 'Sales are counted when a payment succeeds.' }}
          />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel icon={<CreditCard />} title="Recent payments" seeAllHref="/admin/payments" bodyClassName="p-0">
          {payments.length === 0 ? (
            <EmptyState className="m-4" title="No payments yet" description="Payments appear here as soon as a student starts a checkout." />
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/students/${p.studentId}`} className="block truncate text-sm font-medium hover:underline">
                      {p.studentName}
                    </Link>
                    <p className="truncate text-[13px] text-muted-foreground">
                      #{p.number} · {p.planName} · {p.provider} · {timeAgo(p.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular">{money(p.amountMinor, p.currency)}</p>
                    <PaymentStatusBadge status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<Library />} title="Top courses" description="By learners who started a lesson" seeAllHref="/admin/courses" bodyClassName="p-0">
          {courses.courses.length === 0 ? (
            <EmptyState className="m-4" title="No lesson activity yet" description="Courses rank here once students start their lessons." />
          ) : (
            <ul className="divide-y divide-border">
              {courses.courses.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/lessons?course=${c.id}`} className="block truncate text-sm font-medium hover:underline">
                      {c.title}
                    </Link>
                    <p className="text-[13px] text-muted-foreground">
                      {n(c.completions)} lesson completion{c.completions === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[13px] tabular">
                    {n(c.learners)} learner{c.learners === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={<History />} title="Recent activity" description="Latest audit log entries" seeAllHref="/admin/audit-logs" bodyClassName="p-0">
          {activity.length === 0 ? (
            <EmptyState className="m-4" title="No activity recorded yet" description="Content, role and billing changes are logged here automatically." />
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Activity className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{a.action}</code>{' '}
                      <span className="text-muted-foreground">{a.summary || a.entityType}</span>
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {a.actorName ?? 'System'} · {timeAgo(a.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <ReviewQueuePanel items={queue} total={metrics.questions_awaiting_review} />
      </div>
    </>
  )
}

function ReviewQueuePanel({ items, total }: { items: ContentItem[]; total: number }) {
  return (
    <Panel
      icon={<ClipboardCheck />}
      title="Review queue"
      description={`${formatNumber(total)} draft question${total === 1 ? '' : 's'} waiting for review, oldest first`}
      seeAllHref="/admin/questions?view=review"
      bodyClassName="p-0"
    >
      {items.length === 0 ? (
        <EmptyState className="m-4" title="Nothing to review" description="New and imported questions land here as drafts." />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((q) => (
            <li key={q.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/admin/questions/${q.id}`} className="block truncate text-sm font-medium hover:underline">
                  {excerpt(q.title, 90)}
                </Link>
                <p className="text-[13px] text-muted-foreground">
                  {q.meta} · created {timeAgo(q.updatedAt)}
                </p>
              </div>
              <QuestionStatusBadge status={q.status} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

async function ContentOverview({ db, greeting, canEdit }: { db: Awaited<ReturnType<typeof createServerSupabase>>; greeting: string; canEdit: boolean }) {
  const [qCounts, lCounts, cCounts, queue, recent] = await Promise.all([
    questionStatusCounts(db),
    lessonStatusCounts(db),
    courseStatusCounts(db),
    reviewQueue(db, 8),
    recentlyEdited(db, 6),
  ])
  return (
    <>
      <PageHeader
        title="Content overview"
        description={`${greeting}. ${canEdit ? 'Write, review and publish learning content.' : 'Review draft questions and follow content quality.'}`}
        actions={
          canEdit ? (
            <Link href="/admin/questions/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
              <PenLine className="size-4" aria-hidden /> New question
            </Link>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<FileQuestion />}
          label="Published questions"
          value={n(qCounts.published)}
          href="/admin/questions?status=published"
          sub={[
            { label: 'Draft', value: n(qCounts.draft) },
            { label: 'Archived', value: n(qCounts.archived) },
          ]}
        />
        <MetricCard
          icon={<ClipboardCheck />}
          label="Review queue"
          value={n(qCounts.draft)}
          href="/admin/questions?view=review"
          hint="Draft questions waiting for review"
          sub={[{ label: 'Reviewed, not published', value: n(qCounts.reviewed) }]}
        />
        <MetricCard
          icon={<BookOpen />}
          label="Published lessons"
          value={n(lCounts.published)}
          href="/admin/lessons"
          sub={[
            { label: 'Draft', value: n(lCounts.draft) },
            { label: 'Archived', value: n(lCounts.archived) },
          ]}
        />
        <MetricCard
          icon={<Library />}
          label="Published courses"
          value={n(cCounts.published)}
          href="/admin/courses"
          sub={[
            { label: 'Draft', value: n(cCounts.draft) },
            { label: 'Archived', value: n(cCounts.archived) },
          ]}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReviewQueuePanel items={queue} total={qCounts.draft} />
        <Panel icon={<FileQuestion />} title="Recently edited questions" seeAllHref="/admin/questions" bodyClassName="p-0">
          {recent.questions.length === 0 ? (
            <EmptyState
              className="m-4"
              title="No questions yet"
              description="Create a question or import a CSV to start the bank."
              action={canEdit ? <Link className="text-sm font-medium text-primary hover:underline" href="/admin/question-import">Import questions</Link> : undefined}
            />
          ) : (
            <ul className="divide-y divide-border">
              {recent.questions.map((q) => (
                <li key={q.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/questions/${q.id}`} className="block truncate text-sm font-medium hover:underline">
                      {excerpt(q.title, 90)}
                    </Link>
                    <p className="text-[13px] text-muted-foreground">
                      {q.meta} · edited {timeAgo(q.updatedAt)}
                    </p>
                  </div>
                  <QuestionStatusBadge status={q.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel icon={<BookOpen />} title="Recently edited lessons" seeAllHref="/admin/lessons" bodyClassName="p-0" className="lg:col-span-2">
          {recent.lessons.length === 0 ? (
            <EmptyState className="m-4" title="No lessons yet" description="Create a course, then add lessons to it." />
          ) : (
            <ul className="divide-y divide-border">
              {recent.lessons.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/lessons/${l.id}`} className="block truncate text-sm font-medium hover:underline">
                      {l.title}
                    </Link>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {l.meta} · edited {timeAgo(l.updatedAt)}
                    </p>
                  </div>
                  <ContentStatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
