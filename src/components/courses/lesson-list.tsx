import Link from 'next/link'
import { BookOpen, CheckCircle2, CircleDashed, Lock, PlayCircle } from 'lucide-react'
import { Badge } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { plural } from '@/lib/i18n/dict'
import type { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { formatLessonLength } from '@/features/dashboard/format'
import type { CatalogLesson, DomainGroup, LessonProgressLite } from '@/features/courses/catalog'

type T = (typeof coursesDict)['en']

function LessonRow({ t, lesson, progress, entitled }: { t: T; lesson: CatalogLesson; progress?: LessonProgressLite; entitled: boolean }) {
  const completed = progress?.completed ?? false
  const started = !completed && !!progress && (progress.watchedSeconds > 0 || progress.lastPositionSeconds > 0)
  const locked = !entitled && !lesson.isFreePreview
  const KindIcon = lesson.kind === 'video' ? PlayCircle : BookOpen
  const status = completed ? t.lessonItem.completed : started ? t.lessonItem.inProgress : t.lessonItem.notStarted
  return (
    <li>
      <Link href={`/dashboard/lesson/${lesson.id}`} className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/40 sm:items-center">
        <span className="mt-0.5 shrink-0 sm:mt-0" title={status}>
          {completed ? (
            <CheckCircle2 className="size-5 text-success" aria-hidden />
          ) : started ? (
            <CircleDashed className="size-5 text-primary" aria-hidden />
          ) : (
            <span className="block size-5 rounded-full border-2 border-border-strong" aria-hidden />
          )}
          <span className="sr-only">{status}: </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('font-medium text-foreground group-hover:text-primary', completed && 'text-muted-foreground')}>{lesson.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <KindIcon className="size-3.5" aria-hidden />
              {lesson.kind === 'video' ? t.lessonItem.video : t.lessonItem.text}
            </span>
            <span className="tabular">{formatLessonLength(lesson.durationSeconds, t.units)}</span>
            {lesson.isFreePreview && <Badge variant="primary">{t.lessonItem.freePreview}</Badge>}
            {locked && (
              <Badge variant="outline">
                <Lock aria-hidden />
                {t.lessonItem.locked}
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </li>
  )
}

/** Lessons of one subject, grouped domain → skill, with per-lesson state. */
export function LessonGroups({
  t,
  groups,
  progress,
  entitled,
}: {
  t: T
  groups: DomainGroup<CatalogLesson>[]
  progress: Map<string, LessonProgressLite>
  entitled: boolean
}) {
  return (
    <div className="space-y-8">
      {groups.map((dg, i) => (
        <section key={dg.domain?.id ?? `other-${i}`} aria-labelledby={`domain-${dg.domain?.id ?? i}`}>
          <h2 id={`domain-${dg.domain?.id ?? i}`} className="text-[19px] font-semibold text-foreground">
            {dg.domain?.name ?? t.course.otherLessons}
          </h2>
          <div className="mt-3 space-y-4">
            {dg.skills.map((sg, j) => {
              const done = sg.lessons.filter((l) => progress.get(l.id)?.completed).length
              return (
                <div key={sg.skill?.id ?? `none-${j}`} className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-4 py-2.5">
                    <h3 className="font-sans text-sm font-semibold text-foreground">{sg.skill?.name ?? t.course.generalSkill}</h3>
                    <span className="text-xs tabular text-muted-foreground">
                      {done}/{sg.lessons.length} · {plural(sg.lessons.length, t.course.lessonsInSkill)}
                    </span>
                  </div>
                  <ul className="divide-y divide-border">
                    {sg.lessons.map((lesson) => (
                      <LessonRow key={lesson.id} t={t} lesson={lesson} progress={progress.get(lesson.id)} entitled={entitled} />
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
