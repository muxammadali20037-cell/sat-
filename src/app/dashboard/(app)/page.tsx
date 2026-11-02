import type { Metadata } from 'next'
import Link from 'next/link'
import { BookCheck, CircleCheck, Clock3, CreditCard, PenLine } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { dashboardDict } from '@/lib/i18n/dictionaries/dashboard'
import { guidesDict } from '@/lib/i18n/dictionaries/guides'
import { PageHeader } from '@/components/layout/page-header'
import { StatCard } from '@/components/ui/progress'
import { Card } from '@/components/ui/card'
import { ExamCountdownCard, MockExamCard, StreakCard, TargetScoreCard } from '@/components/dashboard/cards'
import { ContinueLearningPanel, RecentResults, RecommendedPractice, SkillExtremes, TodaySchedule } from '@/components/dashboard/lists'
import { SectionTabs } from '@/components/dashboard/section-tabs'
import { NewStudentPanel } from '@/components/dashboard/new-student'
import { ScoreTrendChart } from '@/components/analytics/score-trend-chart'
import { loadDashboard } from '@/features/dashboard/server'
import { formatDate, formatInteger, formatStudyDuration, percent } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(dashboardDict)
  return { title: t.metaTitle }
}

export default async function DashboardPage() {
  const profile = await requireStudentReady()
  const [t, locale, db] = await Promise.all([getDict(dashboardDict), getLocale(), createServerSupabase()])
  const data = await loadDashboard(db, createAdminSupabase, profile)
  const tz = profile.timezone || 'Asia/Tashkent'
  const firstName = profile.fullName.trim().split(/\s+/)[0] ?? ''
  const title = firstName ? format(t.welcome, { name: firstName }) : t.welcomeNoName

  if (data.isNewStudent) {
    // Point first-time students at the "how to use SAT MASTER" guide when it is published.
    const { data: howTo } = await db.from('guides').select('slug').eq('slug', 'how-to-use-sat-master').eq('status', 'published').maybeSingle()
    const tg = await getDict(guidesDict)
    const howToGuide = howTo ? { href: `/dashboard/guides/${howTo.slug}`, label: tg.howToUse } : undefined
    return (
      <>
        <PageHeader title={title} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NewStudentPanel t={t} howToGuide={howToGuide} />
          </div>
          <div className="space-y-4">
            <ExamCountdownCard t={t} exam={data.exam} locale={locale} />
            <TargetScoreCard t={t} target={data.targetScore} latest={data.latest} hasCompletedDiagnostic={false} showCta={false} />
          </div>
        </div>
        {data.plan.tasks.length > 0 && (
          <div className="mt-8">
            <TodaySchedule t={t} plan={data.plan} />
          </div>
        )}
      </>
    )
  }

  const ent = data.entitlements
  const planHint =
    ent.status === 'active' && ent.periodEnd
      ? format(t.stats.planActive, { date: formatDate(ent.periodEnd, locale, tz) })
      : ent.status === 'grace' && ent.periodEnd
        ? format(t.stats.planGrace, { date: formatDate(ent.periodEnd, locale, tz) })
        : t.stats.planFree
  const units = t.units
  const trendPoints = data.estimates
    .filter((p) => p.total)
    .map((p) => ({ key: p.attemptId, label: formatDate(p.completedAt, locale, tz, { month: 'short', day: 'numeric' }), ...p.total! }))
  const defaultSection = profile.preferredSubjects[0] ?? 'reading_writing'

  return (
    <>
      <PageHeader title={title} description={t.subtitle} />

      <ContinueLearningPanel t={t} data={data.continueLearning} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label={t.stats.lessons}
          icon={<BookCheck />}
          value={data.lessons.published > 0 ? formatInteger(data.lessons.completed, locale) : null}
          hint={data.lessons.published > 0 ? format(t.stats.lessonsOf, { total: data.lessons.published }) : t.stats.lessonsNone}
        />
        <StatCard
          label={t.stats.questions}
          icon={<PenLine />}
          value={formatInteger(data.practiceAnswered, locale)}
          hint={t.stats.questionsHint}
        />
        <StatCard
          label={t.stats.accuracy}
          icon={<CircleCheck />}
          value={data.scored.answered > 0 ? percent(data.scored.accuracy) : null}
          hint={data.scored.answered > 0 ? format(t.stats.accuracyHint, { n: formatInteger(data.scored.answered, locale) }) : t.stats.accuracyNone}
        />
        <StatCard
          label={t.stats.studyTime}
          icon={<Clock3 />}
          value={data.studySeconds > 0 ? formatStudyDuration(data.studySeconds, units) : null}
          hint={data.studySeconds > 0 ? t.stats.studyTimeHint : t.stats.studyTimeNone}
        />
        <StatCard
          label={t.stats.plan}
          icon={<CreditCard />}
          value={ent.planName}
          hint={
            ent.status === 'none' ? (
              <Link href="/dashboard/subscription" data-purchase-cta="" className="text-primary hover:underline">
                {planHint}
              </Link>
            ) : (
              planHint
            )
          }
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StreakCard t={t} streak={data.streak} week={data.week} locale={locale} />
        <TargetScoreCard t={t} target={data.targetScore} latest={data.latest} hasCompletedDiagnostic={data.hasCompletedDiagnostic} />
        <ExamCountdownCard t={t} exam={data.exam} locale={locale} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          <SectionTabs sections={data.sections} defaultSection={defaultSection} />
          <TodaySchedule t={t} plan={data.plan} />
          {trendPoints.length >= 2 && (
            <Card className="p-5">
              <h2 className="font-sans text-[15px] font-semibold text-foreground">{t.trend.title}</h2>
              <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">{t.trend.description}</p>
              <ScoreTrendChart
                points={trendPoints}
                target={data.targetScore}
                labels={{
                  summary: format(t.trend.summary, {
                    count: trendPoints.length,
                    first: trendPoints[0]!.label,
                    last: trendPoints[trendPoints.length - 1]!.label,
                    from: trendPoints[0]!.mid,
                    to: trendPoints[trendPoints.length - 1]!.mid,
                  }),
                  table: t.trend.table,
                  caption: t.trend.title,
                  date: t.trend.date,
                  range: t.trend.range,
                  midpoint: t.trend.midpoint,
                  target: data.targetScore !== null ? format(t.trend.target, { n: data.targetScore }) : null,
                }}
              />
              <p className="mt-3 text-xs text-muted-foreground">{t.recent.estimateNote}</p>
            </Card>
          )}
          <RecentResults t={t} items={data.recent} locale={locale} timeZone={tz} />
        </div>

        <div className="min-w-0 space-y-8">
          <RecommendedPractice t={t} items={data.recommended} />
          <SkillExtremes t={t} strongest={data.strongest} weakest={data.weakest} />
          <MockExamCard t={t} mock={data.mock} />
        </div>
      </div>
    </>
  )
}
