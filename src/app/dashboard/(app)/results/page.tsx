import type { Metadata } from 'next'
import Link from 'next/link'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { resultsDict } from '@/lib/i18n/dictionaries/results'
import { learningDict } from '@/lib/i18n/dictionaries/learning'
import { cn, formatDuration, formatPercent } from '@/lib/utils'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { Pagination } from '@/components/ui/data-table'
import { listAttempts, type AttemptListItem } from '@/features/results/server'
import { finalizeExpiredDiagnostics } from '@/features/diagnostic/server'

export const metadata: Metadata = { title: 'Results' }

const KINDS = ['practice', 'diagnostic', 'mock_exam'] as const
type Kind = (typeof KINDS)[number]
const PAGE_SIZE = 20

function hrefFor(a: AttemptListItem): string {
  if (a.kind === 'mock_exam') {
    if (a.status === 'in_progress') return a.mockExamId ? `/dashboard/mock-exams/${a.mockExamId}` : '/dashboard/mock-exams'
    return `/dashboard/mock-exams/results/${a.id}`
  }
  if (a.status === 'in_progress') return a.kind === 'practice' ? `/dashboard/practice/${a.id}` : `/dashboard/diagnostic/${a.id}`
  return `/dashboard/results/${a.id}`
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const profile = await requireStudentReady({ next: '/dashboard/results' })
  const [t, locale, learning] = await Promise.all([getDict(resultsDict), getLocale(), getDict(learningDict)])
  const sp = await searchParams
  const rawKind = Array.isArray(sp.kind) ? sp.kind[0] : sp.kind
  const kind: Kind | undefined = KINDS.includes(rawKind as Kind) ? (rawKind as Kind) : undefined
  const rawPage = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page)
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1

  const admin = createAdminSupabase()
  await finalizeExpiredDiagnostics(admin, profile)
  const { items, total } = await listAttempts(admin, profile.id, { kind, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const dateFormat = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const qs = (k: Kind | undefined, p = 1) => {
    const params = new URLSearchParams()
    if (k) params.set('kind', k)
    if (p > 1) params.set('page', String(p))
    const s = params.toString()
    return s ? `/dashboard/results?${s}` : '/dashboard/results'
  }

  const emptyTitle = kind ? t.empty[kind] : t.empty.all
  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <nav aria-label={t.filters.label} className="flex flex-wrap gap-2">
        {([undefined, ...KINDS] as const).map((k) => {
          const active = k === kind
          return (
            <Link
              key={k ?? 'all'}
              href={qs(k)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center rounded-md border px-3 text-sm transition-colors',
                active ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border hover:bg-muted',
              )}
            >
              {k ? t.filters[k] : t.filters.all}
            </Link>
          )
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={kind ? undefined : t.empty.allBody}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/dashboard/practice">{t.empty.startPractice}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/diagnostic">{t.empty.takeDiagnostic}</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {items.map((a) => {
              const inProgress = a.status === 'in_progress'
              const denominator = a.kind === 'practice' ? a.answeredCount : a.totalQuestions
              const subtitle =
                a.kind === 'practice' ? t.practiceModes[(a.practiceMode ?? 'custom') as keyof typeof t.practiceModes] : t.kinds[a.kind]
              return (
                <li key={a.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{t.kinds[a.kind]}</Badge>
                      <Badge variant={inProgress ? 'warning' : a.status === 'completed' ? 'success' : 'neutral'}>
                        {t.status[a.status as keyof typeof t.status] ?? a.status}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{a.title || subtitle}</p>
                    <p className="text-[13px] text-muted-foreground tabular">
                      {dateFormat.format(new Date(a.completedAt ?? a.startedAt))}
                      {a.title && ` · ${subtitle}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 sm:justify-end">
                    {!inProgress && (
                      <div className="text-right tabular">
                        {a.estimate ? (
                          <p className="text-sm font-semibold">{format(t.estimate, { low: a.estimate.low, high: a.estimate.high })}</p>
                        ) : (
                          <p className="text-sm font-semibold">
                            {format(t.scoreValue, { correct: a.correctCount, total: denominator })}{' '}
                            <span className="font-normal text-muted-foreground">{formatPercent(denominator > 0 ? a.correctCount / denominator : null)}</span>
                          </p>
                        )}
                        {a.timeSpentSeconds > 0 && <p className="text-xs text-muted-foreground">{formatDuration(a.timeSpentSeconds)}</p>}
                      </div>
                    )}
                    <Button asChild size="sm" variant={inProgress ? 'primary' : 'secondary'}>
                      <Link href={hrefFor(a)}>{inProgress ? t.continue : t.viewResults}</Link>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefForPage={(p) => qs(kind, p)} labels={learning.pagination} />
        </>
      )}
    </div>
  )
}
