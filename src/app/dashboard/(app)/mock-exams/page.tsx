import type { Metadata } from 'next'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { examsDict } from '@/lib/i18n/dictionaries/exams'
import { PageHeader } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import { getEntitlements, getUsage } from '@/features/entitlements/server'
import { listExamsForStudent, type StudentExamListItem } from '@/features/exams/queries'

export const metadata: Metadata = { title: 'Mock exams' }

function dateFormatter(locale: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : 'en-US', { dateStyle: 'medium', timeZone })
  } catch {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
  }
}

export default async function MockExamsPage() {
  const profile = await requireStudentReady()
  const [t, locale, entitlements] = await Promise.all([getDict(examsDict), getLocale(), getEntitlements(profile.id)])
  const feature = entitlements.features.mock_exams_monthly
  const [exams, used] = await Promise.all([
    listExamsForStudent(createAdminSupabase(), profile.id),
    feature.enabled && feature.limit !== null ? getUsage(profile.id, 'mock_exams_monthly', profile.timezone) : Promise.resolve(0),
  ])
  const limitReached = feature.enabled && feature.limit !== null && used >= feature.limit
  const canStart = feature.enabled && !limitReached
  const dates = dateFormatter(locale, profile.timezone)

  return (
    <>
      <PageHeader title={t.list.title} description={t.list.description} />

      <div className="mb-6 space-y-3">
        {!feature.enabled ? (
          <UpgradeNotice title={t.list.noPlanTitle} description={t.list.noPlanBody} actionLabel={t.list.seePlans} />
        ) : limitReached ? (
          <UpgradeNotice title={t.list.limitTitle} description={t.list.limitBody} actionLabel={t.list.seePlans} />
        ) : (
          <p className="text-sm text-muted-foreground tabular">
            {feature.limit === null ? t.list.allowanceUnlimited : format(t.list.allowanceUsed, { used, limit: feature.limit })}
          </p>
        )}
      </div>

      {exams.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title={t.list.emptyTitle}
          description={t.list.emptyBody}
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard/practice">{t.list.emptyAction}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {exams.map((exam) => (
            <ExamCard key={exam.id} exam={exam} t={t} canStart={canStart} formatDate={(iso) => dates.format(new Date(iso))} />
          ))}
        </div>
      )}
    </>
  )
}

function ExamCard({
  exam,
  t,
  canStart,
  formatDate,
}: {
  exam: StudentExamListItem
  t: typeof examsDict.en
  canStart: boolean
  formatDate: (iso: string) => string
}) {
  const latest = exam.completed[0] ?? null
  const status = exam.active ? 'inProgress' : latest ? 'completed' : 'notStarted'
  const href = `/dashboard/mock-exams/${exam.id}`
  return (
    <Card className="flex flex-col">
      <div className="flex-1 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="font-sans text-[17px] font-semibold leading-snug">{exam.title}</h2>
          <Badge variant={status === 'inProgress' ? 'warning' : status === 'completed' ? 'success' : 'neutral'}>{t.list[status]}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">{exam.isFullLength ? t.common.fullLength : t.common.shortened}</Badge>
          <Badge variant="outline">{exam.isAdaptive ? t.common.adaptive : t.common.fixed}</Badge>
        </div>
        {exam.description && <p className="mt-3 text-sm text-muted-foreground">{exam.description}</p>}
        <ul className="mt-4 space-y-1 text-[13px] text-muted-foreground tabular">
          {exam.structure.sections.map((s) => (
            <li key={s.section}>
              {format(t.list.structureLine, {
                section: t.sections[s.section],
                questions:
                  s.module1.questions === s.module2.maxQuestions
                    ? format(t.common.questions, { n: s.module1.questions })
                    : format(t.common.questionsRange, {
                        min: Math.min(s.module1.questions, s.module2.minQuestions),
                        max: Math.max(s.module1.questions, s.module2.maxQuestions),
                      }),
                minutes: format(t.common.minutes, { n: s.module1.minutes }),
              })}
            </li>
          ))}
          <li className="text-foreground">
            {format(t.list.totalLine, { questions: exam.structure.totalQuestions, minutes: exam.structure.totalMinutes })}
          </li>
        </ul>
        {latest && latest.totalLow !== null && latest.totalHigh !== null && (
          <p className="mt-4 text-sm">
            <span className="font-semibold tabular">{format(t.list.lastEstimate, { low: latest.totalLow, high: latest.totalHigh })}</span>
          </p>
        )}
        {exam.completed.length > 1 && (
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t.list.history}</summary>
            <ul className="mt-2 space-y-1">
              {exam.completed.map((a) => (
                <li key={a.id}>
                  <Link href={`/dashboard/mock-exams/results/${a.id}`} className="text-primary tabular hover:underline">
                    {format(t.list.attemptLine, {
                      date: formatDate(a.completedAt ?? a.startedAt),
                      low: a.totalLow ?? '—',
                      high: a.totalHigh ?? '—',
                    })}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
        {exam.active ? (
          <Button asChild>
            <Link href={href}>{t.list.resume}</Link>
          </Button>
        ) : canStart ? (
          <Button asChild variant={latest ? 'secondary' : 'primary'}>
            <Link href={href}>{latest ? t.list.retake : t.list.start}</Link>
          </Button>
        ) : (
          <Button disabled variant="secondary">
            {t.list.start}
          </Button>
        )}
        {latest && !exam.active && (
          <Button asChild variant="primary" className="order-first">
            <Link href={`/dashboard/mock-exams/results/${latest.id}`}>{t.list.viewResults}</Link>
          </Button>
        )}
      </div>
    </Card>
  )
}
