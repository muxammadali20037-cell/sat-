import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { getDict } from '@/lib/i18n/server'
import { format, plural } from '@/lib/i18n/dict'
import { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { PageHeader } from '@/components/layout/page-header'
import { ProgressBar } from '@/components/ui/progress'
import { loadCatalog } from '@/features/courses/server'
import { firstIncompleteLesson, SUBJECT_SLUGS } from '@/features/courses/catalog'
import { formatStudyDuration } from '@/features/dashboard/format'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict(coursesDict)
  return { title: t.metaTitle }
}

export default async function CoursesPage() {
  const profile = await requireStudentReady()
  const [t, db] = await Promise.all([getDict(coursesDict), createServerSupabase()])
  const catalog = await loadCatalog(db, profile.id)
  const subjects = [...catalog.taxonomy.subjects].sort((a, b) => {
    const pa = profile.preferredSubjects.indexOf(a.code)
    const pb = profile.preferredSubjects.indexOf(b.code)
    return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb) || a.position - b.position
  })

  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {subjects.map((subject) => {
          const entry = catalog.bySubject.get(subject.code)
          const summary = entry?.summary
          const lessons = entry?.lessons ?? []
          const href = `/dashboard/courses/${SUBJECT_SLUGS[subject.code]}`
          const next = firstIncompleteLesson(lessons, catalog.progress)
          const started = next ? catalog.progress.has(next.id) : false
          const subjectName = t.subjects[subject.code]
          return (
            <section key={subject.id} className="flex flex-col rounded-xl border border-border bg-card p-6" aria-labelledby={`subject-${subject.code}`}>
              <h2 id={`subject-${subject.code}`} className="text-[22px] font-semibold text-foreground">
                <Link href={href} className="hover:text-primary">
                  {subjectName}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.subjectDescriptions[subject.code]}</p>

              {summary && summary.total > 0 ? (
                <>
                  <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-muted-foreground">
                    <span>
                      {plural(summary.total, t.overview.lessonsCount)} · {format(t.overview.totalLength, { time: formatStudyDuration(summary.totalDurationSeconds, t.units) })}
                    </span>
                    <span className="tabular text-foreground">{format(t.overview.progress, { done: summary.completed, total: summary.total })}</span>
                  </div>
                  <ProgressBar
                    value={summary.completed}
                    max={summary.total}
                    className="mt-2"
                    label={format(t.course.progressLabel, { course: subjectName })}
                  />
                  {next && (
                    <Link
                      href={`/dashboard/lesson/${next.id}`}
                      className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm hover:bg-muted/50"
                    >
                      <span className="min-w-0 truncate text-foreground">
                        {format(started ? t.overview.continue : t.overview.start, { title: next.title })}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  )}
                </>
              ) : (
                <p className="mt-5 rounded-lg border border-dashed border-border-strong px-4 py-3 text-sm text-muted-foreground">{t.overview.preparing}</p>
              )}

              <div className="mt-auto pt-5">
                <Link href={href} className="text-sm font-medium text-primary hover:underline">
                  {format(t.overview.open, { subject: subjectName })}
                </Link>
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
