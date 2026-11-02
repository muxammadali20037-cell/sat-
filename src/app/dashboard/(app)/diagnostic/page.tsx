import type { Metadata } from 'next'
import Link from 'next/link'
import { Clock, Info, ListChecks } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { diagnosticDict } from '@/lib/i18n/dictionaries/diagnostic'
import { resultsDict } from '@/lib/i18n/dictionaries/results'
import { formatClock, formatPercent } from '@/lib/utils'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Alert, Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { ProgressBar } from '@/components/ui/progress'
import { getEntitlements } from '@/features/entitlements/server'
import { listAttempts } from '@/features/results/server'
import { diagnosticQuestionCount } from '@/features/diagnostic/compose'
import { secondsUntil } from '@/features/diagnostic/clock'
import { domainsInScope, finalizeExpiredDiagnostics, loadDiagnosticResults, publishedCountsByDomain } from '@/features/diagnostic/server'
import { StartDiagnosticButton } from '@/components/diagnostic/start-diagnostic-button'

export const metadata: Metadata = { title: 'Diagnostic' }

const LEVEL_TONE = { foundation: 'destructive', developing: 'warning', proficient: 'primary', advanced: 'success' } as const

export default async function DiagnosticPage() {
  const profile = await requireStudentReady({ next: '/dashboard/diagnostic' })
  const [t, tr, locale] = await Promise.all([getDict(diagnosticDict), getDict(resultsDict), getLocale()])
  const admin = createAdminSupabase()

  // Lazy expiry: anything whose time ran out is finalized before we list it.
  await finalizeExpiredDiagnostics(admin, profile)

  const [ent, testsRes, counts, inProgress, previous] = await Promise.all([
    getEntitlements(profile.id),
    admin
      .from('diagnostic_tests')
      .select('id, title, description, subject_scope, questions_per_domain, duration_seconds')
      .eq('status', 'published')
      .order('created_at'),
    publishedCountsByDomain(admin),
    admin
      .from('attempts')
      .select('id, diagnostic_test_id, deadline_at, answered_count, total_questions')
      .eq('user_id', profile.id)
      .eq('kind', 'diagnostic')
      .eq('status', 'in_progress'),
    listAttempts(admin, profile.id, { kind: 'diagnostic', statuses: ['completed', 'expired'], limit: 10 }),
  ])
  if (testsRes.error) throw testsRes.error
  if (inProgress.error) throw inProgress.error

  const tests = await Promise.all(
    (testsRes.data ?? []).map(async (test) => {
      const domains = await domainsInScope(admin, test.subject_scope)
      const missing = domains.find((d) => (counts.get(d.id) ?? 0) < test.questions_per_domain)
      return {
        ...test,
        questionCount: diagnosticQuestionCount(domains.length, test.questions_per_domain),
        notReadyDomain: missing?.name ?? null,
        active: (inProgress.data ?? []).find((a) => a.diagnostic_test_id === test.id) ?? null,
      }
    }),
  )

  const latest = previous.items[0]
  const latestLevels = latest ? await loadDiagnosticResults(admin, profile.id, latest.id) : []
  const enabled = ent.features.diagnostic.enabled
  const dateFormat = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : 'en-US', { dateStyle: 'medium' })

  return (
    <div className="space-y-8">
      <PageHeader title={t.title} description={t.description} />
      <Alert variant="neutral" icon={<Info />}>
        {t.disclaimer}
      </Alert>

      {!enabled && <Alert variant="warning" title={t.planRequiredTitle}>{t.planRequiredBody}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section title={t.available.title}>
          {tests.length === 0 ? (
            <EmptyState
              icon={<ListChecks />}
              title={t.available.empty}
              description={t.available.emptyBody}
              action={
                <Button asChild>
                  <Link href="/dashboard/practice">{t.available.practice}</Link>
                </Button>
              }
            />
          ) : (
            <ul className="space-y-3">
              {tests.map((test) => {
                const left = secondsUntil(test.active?.deadline_at ?? null)
                return (
                  <li key={test.id}>
                    <Card className="p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline">{t.scope[test.subject_scope as keyof typeof t.scope] ?? test.subject_scope}</Badge>
                            <Badge variant="success">{t.free}</Badge>
                            {test.active && <Badge variant="warning">{t.inProgress}</Badge>}
                          </div>
                          <h3 className="mt-2 text-base font-semibold">{test.title}</h3>
                          {test.description && <p className="mt-1 text-sm text-muted-foreground">{test.description}</p>}
                          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground tabular">
                            <span>{format(t.questions, { n: test.questionCount })}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5" aria-hidden />
                              {format(t.minutes, { n: Math.round(test.duration_seconds / 60) })}
                            </span>
                            <span>{format(t.perDomain, { n: test.questions_per_domain })}</span>
                          </p>
                          {!test.active && test.notReadyDomain && (
                            <p className="mt-2 text-[13px] text-warning-foreground">{format(t.notReady, { domain: test.notReadyDomain })}</p>
                          )}
                        </div>
                        <div className="shrink-0 sm:text-right">
                          {test.active ? (
                            <>
                              <Button asChild>
                                <Link href={`/dashboard/diagnostic/${test.active.id}`}>{t.resume}</Link>
                              </Button>
                              {left !== null && <p className="mt-1.5 text-[13px] text-muted-foreground tabular">{format(t.timeLeft, { time: formatClock(left) })}</p>}
                            </>
                          ) : (
                            <StartDiagnosticButton diagnosticTestId={test.id} disabled={!enabled || !!test.notReadyDomain}>
                              {t.start}
                            </StartDiagnosticButton>
                          )}
                        </div>
                      </div>
                    </Card>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-base font-semibold">{t.howItWorks.title}</h2>
            <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              {t.howItWorks.steps.map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold text-foreground tabular">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          {latestLevels.length > 0 && latest && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">{t.latest.title}</h2>
              <p className="text-[13px] text-muted-foreground">{t.latest.description}</p>
              <ul className="mt-3 space-y-3">
                {latestLevels.map((d) => (
                  <li key={d.domainId}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{d.domainName}</span>
                      <Badge variant={LEVEL_TONE[d.level]}>{tr.detail.level[d.level]}</Badge>
                    </div>
                    <ProgressBar className="mt-1.5" size="sm" value={d.accuracy * 100} label={`${d.domainName} ${formatPercent(d.accuracy)}`} />
                  </li>
                ))}
              </ul>
              <Button asChild variant="link" size="sm" className="mt-3">
                <Link href={`/dashboard/results/${latest.id}`}>{t.previous.view}</Link>
              </Button>
            </Card>
          )}
        </div>
      </div>

      <Section title={t.previous.title}>
        {previous.items.length === 0 ? (
          <EmptyState title={t.previous.empty} description={t.previous.emptyBody} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {previous.items.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.title || t.title}</p>
                  <p className="text-[13px] text-muted-foreground tabular">
                    {dateFormat.format(new Date(a.completedAt ?? a.startedAt))} · {format(t.previous.score, { correct: a.correctCount, total: a.totalQuestions })}
                  </p>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/dashboard/results/${a.id}`}>{t.previous.view}</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
