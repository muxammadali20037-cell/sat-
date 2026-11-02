import type { Metadata } from 'next'
import Link from 'next/link'
import { Bookmark, Layers } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { formatDuration } from '@/lib/utils'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Badge, Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { ProgressBar } from '@/components/ui/progress'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import { getTaxonomy } from '@/features/taxonomy/server'
import { getMaxQuestionsPerSession, getPracticeUsage } from '@/features/practice/server'
import { bookmarkedQuestionCount, practiceAvailability, publishedPracticeSets, recentPractice } from '@/features/practice/overview'
import { isUuid, lengthOptions } from '@/features/practice/schemas'
import { PracticeBuilder, type BuilderTaxonomy } from '@/components/practice/practice-builder'
import { StartPracticeButton } from '@/components/practice/start-practice-button'
import type { SubjectCode } from '@/types/questions'

export const metadata: Metadata = { title: 'Practice' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function PracticePage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await requireStudentReady({ next: '/dashboard/practice' })
  const t = await getDict(practiceDict)
  const admin = createAdminSupabase()
  const sp = await searchParams

  const [taxonomy, usage, max, availability, sets, recent, bookmarkCount] = await Promise.all([
    getTaxonomy(admin),
    getPracticeUsage(profile.id, profile.timezone),
    getMaxQuestionsPerSession(admin),
    practiceAvailability(admin),
    publishedPracticeSets(admin),
    recentPractice(admin, profile.id, 6),
    bookmarkedQuestionCount(admin, profile.id),
  ])

  const builderTaxonomy: BuilderTaxonomy = {
    subjects: taxonomy.subjects.map((s) => ({ code: s.code, name: s.name })),
    domains: taxonomy.domains.map((d) => ({ id: d.id, subjectCode: taxonomy.subjectById.get(d.subjectId)?.code ?? 'math', name: d.name })),
    skills: taxonomy.skills.map((s) => ({ id: s.id, domainId: s.domainId, name: s.name })),
  }

  // Prefill from the URL contract: ?subject=&domain=&skill= (validated against the taxonomy).
  const qsSubject = first(sp.subject)
  const qsDomain = first(sp.domain)
  const qsSkill = first(sp.skill)
  const skill = isUuid(qsSkill) ? taxonomy.skillById.get(qsSkill) : undefined
  const domain = skill ? taxonomy.domainById.get(skill.domainId) : isUuid(qsDomain) ? taxonomy.domainById.get(qsDomain) : undefined
  const subjectFromDomain = domain ? taxonomy.subjectById.get(domain.subjectId)?.code : undefined
  const preferred = profile.preferredSubjects[0]
  const subject: SubjectCode =
    subjectFromDomain ?? (qsSubject === 'math' || qsSubject === 'reading_writing' ? qsSubject : (preferred ?? 'math'))
  const initial = { subject, domainId: domain?.id ?? '', skillId: skill?.id ?? '' }

  const remaining = usage.enabled ? (usage.limit === null ? null : Math.max(0, usage.limit - usage.used)) : 0
  const exhausted = remaining === 0

  return (
    <div className="space-y-8">
      <PageHeader title={t.title} description={t.description} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-[19px] font-semibold">{t.builder.title}</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">{t.builder.description}</p>
          {!usage.enabled ? (
            <UpgradeNotice title={t.usage.disabledTitle} description={t.usage.disabledBody} actionLabel={t.usage.seePlans} />
          ) : (
            <>
              {exhausted && usage.limit !== null && (
                <UpgradeNotice
                  className="mb-5"
                  title={t.usage.limitTitle}
                  description={format(t.usage.limitBody, { limit: usage.limit })}
                  actionLabel={t.usage.seePlans}
                />
              )}
              <PracticeBuilder
                taxonomy={builderTaxonomy}
                availability={availability}
                lengths={lengthOptions(max)}
                remainingToday={remaining}
                initial={initial}
              />
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm font-medium">{t.usage.label}</p>
            {usage.enabled && usage.limit !== null ? (
              <>
                <p className="mt-1 text-[13px] text-muted-foreground tabular">{format(t.usage.used, { used: usage.used, limit: usage.limit })}</p>
                <ProgressBar
                  className="mt-3"
                  value={usage.used}
                  max={usage.limit}
                  label={t.usage.label}
                  tone={usage.used >= usage.limit ? 'warning' : 'primary'}
                />
              </>
            ) : (
              <p className="mt-1 text-[13px] text-muted-foreground">{usage.enabled ? t.usage.unlimited : t.usage.disabledTitle}</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3">
              <Bookmark className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.bookmarks.title}</p>
                <p className="mt-1 text-[13px] text-muted-foreground tabular">
                  {bookmarkCount === 0 ? t.bookmarks.none : bookmarkCount === 1 ? t.bookmarks.countOne : format(t.bookmarks.count, { n: bookmarkCount })}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {bookmarkCount > 0 && (
                <StartPracticeButton request={{ mode: 'bookmarks' }} size="sm" disabled={!usage.enabled || exhausted}>
                  {t.bookmarks.start}
                </StartPracticeButton>
              )}
              <Button asChild size="sm" variant="ghost">
                <Link href="/dashboard/bookmarks">{t.bookmarks.manage}</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Section title={t.sets.title} description={t.sets.description}>
        {sets.length === 0 ? (
          <EmptyState icon={<Layers />} title={t.sets.empty} description={t.sets.emptyBody} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sets.map((set) => (
              <li key={set.id}>
                <Card className="flex h-full flex-col p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{t.subjects[set.subjectCode]}</Badge>
                    {set.difficulty && <Badge>{t.difficulty[set.difficulty as keyof typeof t.difficulty] ?? set.difficulty}</Badge>}
                  </div>
                  <p className="mt-2 font-medium">{set.title}</p>
                  {(set.skillName || set.domainName) && <p className="text-[13px] text-muted-foreground">{set.skillName ?? set.domainName}</p>}
                  {set.description && <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{set.description}</p>}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <span className="text-[13px] text-muted-foreground tabular">
                      {set.questionCount === 1 ? t.sets.countOne : format(t.sets.count, { n: set.questionCount })}
                    </span>
                    <StartPracticeButton request={{ mode: 'set', practiceSetId: set.id }} size="sm" variant="secondary" disabled={!usage.enabled || exhausted}>
                      {t.sets.start}
                    </StartPracticeButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t.recent.title}
        actions={
          recent.length > 0 ? (
            <Button asChild variant="link" size="sm">
              <Link href="/dashboard/results?kind=practice">{t.recent.viewAll}</Link>
            </Button>
          ) : undefined
        }
      >
        {recent.length === 0 ? (
          <EmptyState title={t.recent.empty} description={t.recent.emptyBody} />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {recent.map((a) => {
              const inProgress = a.status === 'in_progress'
              const misses = a.answeredCount - a.correctCount + (a.totalQuestions - a.answeredCount)
              return (
                <li key={a.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title || t.recent.mixed}</p>
                    <p className="text-[13px] text-muted-foreground tabular">
                      {t.modes[(a.practiceMode ?? 'custom') as keyof typeof t.modes]} ·{' '}
                      {inProgress ? t.recent.inProgress : format(t.recent.score, { correct: a.correctCount, answered: a.answeredCount })}
                      {a.timeSpentSeconds > 0 && ` · ${formatDuration(a.timeSpentSeconds)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {inProgress ? (
                      <Button asChild size="sm">
                        <Link href={`/dashboard/practice/${a.id}`}>{t.recent.continue}</Link>
                      </Button>
                    ) : (
                      <>
                        {misses > 0 && (
                          <StartPracticeButton request={{ mode: 'retry', sourceAttemptId: a.id }} size="sm" variant="secondary" disabled={!usage.enabled || exhausted}>
                            {t.recent.retry}
                          </StartPracticeButton>
                        )}
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/results/${a.id}`}>{t.recent.results}</Link>
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
