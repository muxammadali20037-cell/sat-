import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { ADMIN_ROLES, STUDENT_VIEWER_ROLES, hasRole, isRole } from '@/config/roles'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { ProgressBar, StatCard } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { ColumnSeriesChart } from '@/components/admin/charts'
import { PaymentStatusBadge, RoleBadge } from '@/components/admin/status-badge'
import { StudentAdminActions } from '@/components/admin/student-admin-actions'
import { loadStudentDetail } from '@/features/admin/students'
import { isUuid } from '@/features/admin/params'
import { formatDate, formatDateTime, money, timeAgo } from '@/features/admin/format'
import { bucketLabels } from '@/features/admin/series'
import { formatDuration, formatNumber, formatPercent } from '@/lib/utils'
import { SUBJECT_LABELS } from '@/types/questions'

export const metadata: Metadata = { title: 'Student' }

const LEVEL_LABELS: Record<string, string> = { new: 'New to the SAT', some_prep: 'Some preparation', experienced: 'Experienced' }
const KIND_LABELS: Record<string, string> = { practice: 'Practice', diagnostic: 'Diagnostic', mock_exam: 'Mock exam' }
const BAND_LABELS: Record<string, string> = { foundation: 'Foundation', developing: 'Developing', proficient: 'Proficient', advanced: 'Advanced' }

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireRole(STUDENT_VIEWER_ROLES, { next: '/admin/students' })
  const { id } = await params
  if (!isUuid(id)) notFound()
  const isAdmin = hasRole(viewer.role, ADMIN_ROLES)
  const db = await createServerSupabase()
  const detail = await loadStudentDetail(db, id, { includeBilling: isAdmin })
  if (!detail) notFound()
  const { profile: p, attempts, activityDays, progress, skills, subscriptions, payments, diagnostic } = detail
  const role = isRole(p.role) ? p.role : 'STUDENT'

  const totals = activityDays.reduce(
    (acc, d) => ({ q: acc.q + d.questions, c: acc.c + d.correct, s: acc.s + d.studySeconds, l: acc.l + d.lessons, days: acc.days + (d.questions || d.lessons || d.studySeconds >= 60 ? 1 : 0) }),
    { q: 0, c: 0, s: 0, l: 0, days: 0 },
  )
  const paidPayments = payments.filter((x) => x.status === 'succeeded' || x.status === 'refunded')

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Students', href: '/admin/students' }, { label: p.full_name || p.email }]} />}
        title={p.full_name || 'Unnamed student'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {p.email} <RoleBadge role={role} />
            {p.is_suspended && <Badge variant="destructive">Suspended</Badge>}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile and goals</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Joined" value={formatDate(p.created_at)} />
              <Field label="Last active" value={timeAgo(p.last_active_at)} />
              <Field label="Onboarding" value={p.onboarding_completed_at ? `Completed ${formatDate(p.onboarding_completed_at)}` : 'Not completed'} />
              <Field label="Target score" value={p.target_score ?? '—'} />
              <Field label="Exam date" value={p.exam_date ? formatDate(p.exam_date) : '—'} />
              <Field label="Daily study goal" value={p.daily_study_minutes ? `${p.daily_study_minutes} min` : '—'} />
              <Field label="Prep level" value={p.sat_level ? (LEVEL_LABELS[p.sat_level] ?? p.sat_level) : '—'} />
              <Field label="Subjects" value={(p.preferred_subjects ?? []).map((s) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s).join(', ') || '—'} />
              <Field label="Language · time zone" value={`${p.locale.toUpperCase()} · ${p.timezone}`} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <StudentAdminActions userId={p.id} email={p.email} currentRole={role} actorRole={viewer.role} isSuspended={p.is_suspended} isSelf={p.id === viewer.id} />
            ) : (
              <p className="text-sm text-muted-foreground">Only admins can change roles or suspend accounts.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Questions (30 days)" value={formatNumber(totals.q)} hint={totals.q > 0 ? `${formatPercent(totals.c / totals.q)} correct` : 'No answers in the last 30 days'} />
        <StatCard label="Study time (30 days)" value={formatDuration(totals.s)} />
        <StatCard label="Lessons completed (30 days)" value={formatNumber(totals.l)} />
        <StatCard label="Active days (30 days)" value={`${totals.days} / 30`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6">
        <Section title="Activity" description="Questions answered per day, last 30 days (student's time zone)">
          <Card>
            <CardContent className="pt-5">
              <ColumnSeriesChart
                points={activityDays.map((d) => ({ key: d.date, ...bucketLabels(d.date, 'day'), value: d.questions }))}
                ariaLabel="Questions answered per day"
                valueLabel="Questions"
                periodLabel="Day"
                height={180}
                empty={{ title: 'No activity in the last 30 days', description: 'Daily practice, lessons and exams show up here.' }}
              />
            </CardContent>
          </Card>
        </Section>

        {isAdmin && (
          <Section title="Subscription and payments">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Subscriptions</CardTitle>
                </CardHeader>
                <CardContent>
                  {subscriptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">On the free plan — no paid subscription yet.</p>
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {subscriptions.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                          <div>
                            <p className="font-medium">{s.plans?.name ?? 'Plan'}</p>
                            <p className="text-[13px] text-muted-foreground">
                              {formatDate(s.current_period_start)} – {formatDate(s.current_period_end)}
                              {s.cancel_at_period_end ? ' · cancels at period end' : ''}
                            </p>
                          </div>
                          <Badge variant={s.status === 'active' ? 'success' : 'neutral'}>{s.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Payments</CardTitle>
                  <p className="text-[13px] text-muted-foreground">
                    {paidPayments.length} paid · {payments.length - paidPayments.length} other (latest 10)
                  </p>
                </CardHeader>
                <CardContent>
                  {payments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payments.</p>
                  ) : (
                    <ul className="divide-y divide-border text-sm">
                      {payments.map((x) => (
                        <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="font-medium tabular">
                              {money(Number(x.amount_minor), x.currency)}
                              {x.refund_amount_minor ? <span className="text-muted-foreground"> (refunded {money(Number(x.refund_amount_minor), x.currency)})</span> : null}
                            </p>
                            <p className="truncate text-[13px] text-muted-foreground">
                              #{x.number} · {x.plans?.name ?? ''} · {x.provider} · {formatDate(x.paid_at ?? x.created_at)}
                            </p>
                          </div>
                          <PaymentStatusBadge status={x.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </Section>
        )}

        <Section title="Recent attempts">
          <DataTable
            caption="Recent attempts"
            rows={attempts}
            rowKey={(a) => a.id}
            empty={{ title: 'No attempts yet', description: 'Practice sessions, diagnostics and mock exams appear here.' }}
            columns={[
              {
                key: 'kind',
                header: 'Type',
                cell: (a) => (
                  <div>
                    <p className="font-medium">{KIND_LABELS[a.kind] ?? a.kind}</p>
                    <p className="text-[13px] text-muted-foreground">{a.mock_exams?.title ?? a.diagnostic_tests?.title ?? a.skills?.name ?? (a.practice_mode ? `${a.practice_mode} practice` : '')}</p>
                  </div>
                ),
              },
              { key: 'status', header: 'Status', cell: (a) => <Badge variant={a.status === 'completed' ? 'success' : a.status === 'in_progress' ? 'primary' : 'neutral'}>{a.status.replace('_', ' ')}</Badge> },
              {
                key: 'score',
                header: 'Score',
                align: 'right',
                cell: (a) =>
                  a.total_questions > 0 ? (
                    <span>
                      {a.correct_count}/{a.total_questions}{' '}
                      <span className="text-muted-foreground">({formatPercent(a.correct_count / a.total_questions)})</span>
                    </span>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'estimate',
                header: 'Estimate (unofficial)',
                hideBelow: 'md',
                cell: (a) =>
                  a.kind === 'mock_exam' && (a.rw_estimate_low || a.math_estimate_low) ? (
                    <span className="text-[13px]">
                      RW {a.rw_estimate_low ?? '—'}–{a.rw_estimate_high ?? '—'} · Math {a.math_estimate_low ?? '—'}–{a.math_estimate_high ?? '—'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              { key: 'time', header: 'Time', hideBelow: 'lg', align: 'right', cell: (a) => formatDuration(a.time_spent_seconds) },
              { key: 'date', header: 'Started', hideBelow: 'sm', cell: (a) => formatDateTime(a.started_at) },
            ]}
          />
        </Section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Skill performance" description="Weakest first, from all scored answers">
            <Card>
              <CardContent className="pt-5">
                {skills.length === 0 ? (
                  <EmptyState title="No scored answers yet" description="Skill accuracy appears after the first practice or diagnostic." />
                ) : (
                  <ul className="grid grid-cols-1 gap-3">
                    {skills.slice(0, 12).map((s) => (
                      <li key={s.skillId}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            {s.name} <span className="text-[13px] text-muted-foreground">· {s.domain}</span>
                          </span>
                          <span className="shrink-0 tabular">
                            {formatPercent(s.accuracy)} <span className="text-[13px] text-muted-foreground">({s.correct}/{s.answered})</span>
                          </span>
                        </div>
                        <ProgressBar value={s.accuracy * 100} label={`${s.name} accuracy`} tone={s.accuracy >= 0.7 ? 'success' : s.accuracy >= 0.4 ? 'primary' : 'warning'} size="sm" />
                      </li>
                    ))}
                  </ul>
                )}
                {diagnostic.length > 0 && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-2 text-sm font-medium">Latest diagnostic ({formatDate(diagnostic[0]!.createdAt)}) — SAT MASTER internal, not an official score</p>
                    <ul className="flex flex-wrap gap-2">
                      {diagnostic.map((d) => (
                        <li key={d.domain}>
                          <Badge variant="outline">
                            {d.domain}: {BAND_LABELS[d.level] ?? d.level} ({formatPercent(d.accuracy)})
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </Section>

          <Section title="Lesson progress" description="Most recent first">
            <Card>
              <CardContent className="pt-5">
                {progress.length === 0 ? (
                  <EmptyState title="No lessons started" description="Lesson progress appears when the student watches or reads a lesson." />
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {progress.map((lp) => {
                      const duration = lp.lessons?.duration_seconds ?? 0
                      const ratio = duration > 0 ? Math.min(1, lp.watched_seconds / duration) : 0
                      return (
                        <li key={lp.id} className="py-2.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <Link href={lp.lessons ? `/admin/lessons/${lp.lessons.id}` : '#'} className="min-w-0 truncate font-medium hover:underline">
                              {lp.lessons?.title ?? 'Lesson'}
                            </Link>
                            {lp.completed_at ? <Badge variant="success">Completed</Badge> : <span className="text-[13px] tabular text-muted-foreground">{formatPercent(ratio)}</span>}
                          </div>
                          <p className="text-[13px] text-muted-foreground">
                            {lp.lessons?.courses?.title ?? ''} · {timeAgo(lp.updated_at)}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </Section>
        </div>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  )
}
