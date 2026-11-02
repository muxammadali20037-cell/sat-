import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { format } from '@/lib/i18n/dict'
import type { LessonNeighbor } from '@/features/lessons/types'

type T = (typeof coursesDict)['en']

/** Previous / next lesson in the course (canonical order). */
export function LessonNavigation({
  t,
  prev,
  next,
  course,
}: {
  t: T
  prev: LessonNeighbor | null
  next: LessonNeighbor | null
  course: { title: string; href: string }
}) {
  const cell = 'flex min-h-16 flex-1 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/50'
  return (
    <nav aria-label={t.lesson.navLabel} className="flex flex-col gap-3 sm:flex-row">
      {prev ? (
        <Link href={`/dashboard/lesson/${prev.id}`} rel="prev" className={cell}>
          <ChevronLeft className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{t.lesson.previous}</span>
            <span className="block truncate text-sm font-medium text-foreground">{prev.title}</span>
          </span>
        </Link>
      ) : (
        <Link href={course.href} className={cell}>
          <ChevronLeft className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">{format(t.lesson.backToCourse, { course: course.title })}</span>
        </Link>
      )}
      {next ? (
        <Link href={`/dashboard/lesson/${next.id}`} rel="next" className={`${cell} justify-end text-right`}>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{t.lesson.next}</span>
            <span className="block truncate text-sm font-medium text-foreground">{next.title}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : (
        <Link href={course.href} className={`${cell} justify-end text-right`}>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{t.lesson.courseComplete}</span>
            <span className="block truncate text-sm font-medium text-foreground">{format(t.lesson.backToCourse, { course: course.title })}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      )}
    </nav>
  )
}
