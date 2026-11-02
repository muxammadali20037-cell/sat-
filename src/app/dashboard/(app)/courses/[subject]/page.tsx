import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { hasRole, STAFF_ROLES } from '@/config/roles'
import { PageHeader } from '@/components/layout/page-header'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/states'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import { LessonGroups } from '@/components/courses/lesson-list'
import { loadCatalog } from '@/features/courses/server'
import { groupLessonsByDomainSkill, subjectFromSlug } from '@/features/courses/catalog'
import { getEntitlements } from '@/features/entitlements/server'
import { formatStudyDuration } from '@/features/dashboard/format'

type Props = { params: Promise<{ subject: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subject } = await params
  const code = subjectFromSlug(subject)
  const t = await getDict(coursesDict)
  return { title: code ? t.subjects[code] : t.metaTitle }
}

export default async function SubjectCoursePage({ params }: Props) {
  const { subject } = await params
  const code = subjectFromSlug(subject)
  if (!code) notFound()

  const profile = await requireStudentReady()
  const [t, db, ent] = await Promise.all([getDict(coursesDict), createServerSupabase(), getEntitlements(profile.id)])
  const catalog = await loadCatalog(db, profile.id)
  const entry = catalog.bySubject.get(code)
  const subjectName = t.subjects[code]
  const entitled = ent.features.video_lessons.enabled || hasRole(profile.role, STAFF_ROLES)
  const courses = entry?.courses.filter((c) => c.lessons.length > 0) ?? []

  const breadcrumb = <Breadcrumb items={[{ label: t.course.breadcrumb, href: '/dashboard/courses' }, { label: subjectName }]} />

  if (courses.length === 0) {
    return (
      <>
        <PageHeader title={subjectName} description={t.subjectDescriptions[code]} breadcrumb={breadcrumb} />
        <EmptyState
          title={t.course.empty}
          description={t.course.emptyBody}
          action={
            <Button asChild variant="secondary">
              <Link href={`/dashboard/practice?subject=${code}`}>{format(t.course.practiseInstead, { subject: subjectName })}</Link>
            </Button>
          }
        />
      </>
    )
  }

  const hasLocked = !entitled && courses.some((c) => c.lessons.some((l) => !l.isFreePreview))

  return (
    <>
      <PageHeader title={subjectName} description={t.subjectDescriptions[code]} breadcrumb={breadcrumb} />
      {hasLocked && (
        <UpgradeNotice className="mb-6" title={t.lesson.lockedTitle} description={t.course.lockedNote} actionLabel={t.course.seePlans} />
      )}
      <div className="space-y-12">
        {courses.map((course) => (
          <article key={course.id} aria-labelledby={`course-${course.id}`}>
            <div className="mb-6 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={`course-${course.id}`} className="text-[22px] font-semibold text-foreground">
                  {course.title}
                </h2>
                <Badge variant="outline">{t.course.levels[course.level]}</Badge>
              </div>
              {course.description && <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{course.description}</p>}
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-muted-foreground">
                <span>
                  {plural(course.summary.total, t.overview.lessonsCount)} ·{' '}
                  {format(t.overview.totalLength, { time: formatStudyDuration(course.summary.totalDurationSeconds, t.units) })}
                </span>
                <span className="tabular text-foreground">
                  {format(t.overview.progress, { done: course.summary.completed, total: course.summary.total })}
                </span>
              </div>
              <ProgressBar
                value={course.summary.completed}
                max={course.summary.total}
                className="mt-2"
                label={format(t.course.progressLabel, { course: course.title })}
              />
            </div>
            <LessonGroups t={t} groups={groupLessonsByDomainSkill(course.lessons, catalog.taxonomy)} progress={catalog.progress} entitled={entitled} />
          </article>
        ))}
      </div>
    </>
  )
}
