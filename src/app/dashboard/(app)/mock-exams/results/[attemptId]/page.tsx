import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { examsDict } from '@/lib/i18n/dictionaries/exams'
import { formatDuration, formatPercent } from '@/lib/utils'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { ResultsReview } from '@/components/exams/results-review'
import { getExamResults } from '@/features/exams/queries'
import { SECTIONS, sectionNumber, type ExamSection } from '@/features/exams/machine'
import { intlLocale } from '@/features/dashboard/format'

export const metadata: Metadata = { title: 'Mock exam results' }

/** A 200–800 band with the estimated range marked (the score-scale motif). */
function ScaleBar({ low, high, min, max, label }: { low: number; high: number; min: number; max: number; label: string }) {
  const left = ((low - min) / (max - min)) * 100
  const width = Math.max(2, ((high - low) / (max - min)) * 100)
  return (
    <div className="mt-3" aria-hidden>
      <div className="relative h-2 rounded-full bg-muted">
        <div className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${left}%`, width: `${width}%` }} title={label} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

export default async function MockExamResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params
  const profile = await requireStudentReady()
  if (!z.guid().safeParse(attemptId).success) notFound()
  const [t, locale] = await Promise.all([getDict(examsDict), getLocale()])
  // Ownership is enforced inside getExamResults (user_id filter); keys are revealed only for completed attempts.
  const lookup = await getExamResults(createAdminSupabase(), attemptId, profile.id, locale)
  if (lookup.kind === 'not_found') notFound()
  if (lookup.kind === 'in_progress') redirect(`/dashboard/mock-exams/${lookup.mockExamId}`)
  const res = lookup.results
  const rr = t.results

  let completedDate = res.completedAt
  try {
    completedDate = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long', timeZone: profile.timezone }).format(
      new Date(res.completedAt),
    )
  } catch {
    // keep ISO
  }

  const moduleLabel = (section: ExamSection, n: number) => format(t.common.moduleShort, { name: t.sections[section], module: n })
  const routing = SECTIONS.map((section) => {
    const m1 = res.modules.find((m) => m.section === section && m.moduleNumber === 1)
    const m2 = res.modules.find((m) => m.section === section && m.moduleNumber === 2)
    if (!m1 || !m2) return null
    const pct = formatPercent(m1.total > 0 ? m1.correct / m1.total : 0)
    const threshold = formatPercent(res.exam.routingThreshold)
    const text =
      m2.variant === 'harder'
        ? format(rr.routeHarder, { pct, threshold })
        : m2.variant === 'easier'
          ? format(rr.routeEasier, { pct, threshold })
          : rr.routeStandard
    return { section, variant: m2.variant, text }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: t.list.title, href: '/dashboard/mock-exams' }, { label: rr.title }]} />}
        title={res.exam.title}
        description={format(rr.completedOn, { date: completedDate, time: formatDuration(res.timeSpentSeconds) })}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/dashboard/mock-exams">{rr.allExams}</Link>
            </Button>
            <Button asChild>
              <Link href={`/dashboard/mock-exams/${res.exam.id}`}>{rr.retake}</Link>
            </Button>
          </>
        }
      />

      <div className="space-y-10">
        <section aria-labelledby="estimate-heading" className="rounded-xl border border-border bg-card">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-border md:grid-cols-3">
            <div className="bg-navy-900 p-5 text-white">
              <h2 id="estimate-heading" className="font-sans text-[13px] font-medium text-white/70">
                {rr.estimateTitle} · {rr.totalLabel}
              </h2>
              <p className="mt-2 font-sans text-4xl font-semibold tabular">
                {res.estimates.total ? `${res.estimates.total.low}–${res.estimates.total.high}` : '—'}
              </p>
              <p className="mt-1 text-[13px] text-white/70 tabular">{format(rr.summary, { correct: res.correct, total: res.totalQuestions, answered: res.answered })}</p>
            </div>
            {SECTIONS.map((section) => {
              const range = res.estimates[section]
              return (
                <div key={section} className="bg-card p-5">
                  <p className="text-[13px] text-muted-foreground">{t.sections[section]}</p>
                  <p className="mt-2 font-sans text-3xl font-semibold tabular">{range ? `${range.low}–${range.high}` : '—'}</p>
                  {range && <ScaleBar low={range.low} high={range.high} min={200} max={800} label={`${range.low}–${range.high}`} />}
                </div>
              )
            })}
          </div>
          <p className="border-t border-border px-5 py-3 text-[13px] font-medium text-muted-foreground">{rr.disclaimer}</p>
        </section>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <Section title={rr.rawTitle}>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {res.modules.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <th scope="row" className="px-4 py-3 text-left font-medium">
                        <span className="mr-2 text-muted-foreground tabular">{sectionNumber(m.section)}.{m.moduleNumber}</span>
                        {moduleLabel(m.section, m.moduleNumber)}
                        <span className="ml-2 inline-flex gap-1 align-middle">
                          {m.moduleNumber === 2 && m.variant !== 'standard' && (
                            <Badge variant={m.variant === 'harder' ? 'navy' : 'outline'}>{t.variants[m.variant]}</Badge>
                          )}
                          {m.status === 'expired' && <Badge variant="warning">{rr.timedOut}</Badge>}
                        </span>
                      </th>
                      <td className="px-4 py-3 text-right tabular">{format(rr.rawValue, { correct: m.correct, total: m.total })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={rr.routingTitle}>
            <ul className="space-y-3">
              {routing.map((x) => (
                <li key={x.section} className="rounded-lg border border-border p-4 text-sm">
                  <p className="font-medium">{t.sections[x.section]}</p>
                  <p className="mt-1 text-muted-foreground">{x.text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title={rr.domainsTitle}>
          <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
            {SECTIONS.map((section) => (
              <div key={section} className="space-y-3">
                <p className="text-[13px] font-medium text-muted-foreground">{t.sections[section]}</p>
                {res.domains
                  .filter((d) => d.section === section)
                  .map((d) => (
                    <div key={d.domainId}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                        <span>{d.name}</span>
                        <span className="tabular text-muted-foreground">
                          {format(rr.domainValue, { correct: d.correct, total: d.total })} · {formatPercent(d.total > 0 ? d.correct / d.total : null)}
                        </span>
                      </div>
                      <ProgressBar value={d.correct} max={d.total} label={d.name} size="sm" />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Section>

        <Section title={rr.howTitle}>
          <div className="rounded-lg border border-border bg-muted/40 p-5 text-sm leading-relaxed">
            <p>{rr.howIntro}</p>
            <ul className="mt-3 space-y-1.5 font-medium tabular">
              <li>{rr.howHarder}</li>
              <li>{rr.howEasier}</li>
              <li>{rr.howStandard}</li>
            </ul>
            <p className="mt-3 text-muted-foreground">{rr.howRange}</p>
            <p className="mt-3 font-medium">{rr.disclaimer}</p>
          </div>
        </Section>

        <Section title={rr.reviewTitle} description={rr.reviewBody}>
          <ResultsReview modules={res.modules} />
        </Section>
      </div>
    </>
  )
}
