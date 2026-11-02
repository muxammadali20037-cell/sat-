import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, ExternalLink, FileText, Lock, PlayCircle } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Alert, Badge } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RichText } from '@/components/learning/rich-text'
import { UpgradeNotice } from '@/components/subscription/upgrade-notice'
import { LessonStudy } from '@/components/courses/lesson-study'
import { LessonNavigation } from '@/components/courses/lesson-navigation'
import { BookmarkButton } from '@/components/courses/bookmark-button'
import { getLessonView, getPublishedLesson } from '@/features/lessons/server'
import { formatLessonLength } from '@/features/dashboard/format'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const t = await getDict(coursesDict)
  const lesson = await getPublishedLesson(await createServerSupabase(), id).catch(() => null)
  return { title: lesson?.title ?? t.lesson.metaFallback }
}

export default async function LessonPage({ params }: Props) {
  const { id } = await params
  const profile = await requireStudentReady()
  const [t, db] = await Promise.all([getDict(coursesDict), createServerSupabase()])
  const view = await getLessonView({ db, admin: createAdminSupabase, user: { id: profile.id, role: profile.role }, lessonId: id })
  if (!view) notFound()

  const subjectName = t.subjects[view.course.subjectCode]
  const KindIcon = view.kind === 'video' ? PlayCircle : BookOpen
  const notes = view.body ? (
    <section aria-labelledby="lesson-notes" className="rounded-lg border border-border bg-card p-5 sm:p-6">
      <h2 id="lesson-notes" className="text-[19px] font-semibold text-foreground">
        {t.lesson.notes}
      </h2>
      <RichText source={view.body} className="reading mt-3 text-foreground" />
    </section>
  ) : null

  return (
    <article className="mx-auto max-w-4xl">
      <Breadcrumb
        className="mb-3"
        items={[
          { label: t.course.breadcrumb, href: '/dashboard/courses' },
          { label: subjectName, href: view.course.href },
          ...(view.skill ? [{ label: view.skill.name }] : []),
          { label: view.title },
        ]}
      />
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight text-foreground sm:text-[32px]">{view.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <KindIcon className="size-4" aria-hidden />
              {view.kind === 'video' ? t.lessonItem.video : t.lessonItem.text}
            </span>
            <span className="tabular">{formatLessonLength(view.durationSeconds, t.units)}</span>
            <span>{view.course.title}</span>
            {view.domain && <span>{view.domain.name}</span>}
            {view.isFreePreview && <Badge variant="primary">{t.lesson.freePreview}</Badge>}
          </div>
          {view.description && <p className="mt-3 max-w-[68ch] text-[15px] text-muted-foreground">{view.description}</p>}
        </div>
        <div className="shrink-0">
          <BookmarkButton lessonId={view.id} initial={view.bookmarked} />
        </div>
      </header>

      <div className="space-y-8">
        {view.locked ? (
          <UpgradeNotice title={t.lesson.lockedTitle} description={t.lesson.lockedBody} actionLabel={t.lesson.seePlans} />
        ) : (
          <>
            {view.kind === 'video' && view.playbackError && (
              <Alert variant="warning" title={view.playbackError.code === 'PROVIDER_NOT_CONFIGURED' ? t.lesson.notConfigured : t.lesson.videoError} />
            )}
            <LessonStudy
              lessonId={view.id}
              title={view.title}
              kind={view.kind}
              playback={view.playback}
              progress={view.progress}
              timeZone={profile.timezone}
              notes={view.kind === 'text' ? notes : undefined}
            />
          </>
        )}

        {view.objectives.length > 0 && (
          <section aria-labelledby="lesson-objectives">
            <h2 id="lesson-objectives" className="text-[19px] font-semibold text-foreground">
              {t.lesson.objectives}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-foreground marker:text-muted-foreground">
              {view.objectives.map((o, i) => (
                <li key={i}>
                  <RichText source={o} as="span" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!view.locked && view.kind === 'video' && notes}

        {view.resources.length > 0 && (
          <section aria-labelledby="lesson-resources">
            <h2 id="lesson-resources" className="text-[19px] font-semibold text-foreground">
              {t.lesson.resources}
            </h2>
            <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">
              {view.resources.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {r.kind === 'file' ? <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-primary hover:underline">
                      {r.title}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.title}</span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.locked ? (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="size-3.5" aria-hidden />
                        {t.lessonItem.locked}
                      </span>
                    ) : r.url ? (
                      r.kind === 'file' ? t.lesson.resourceFile : t.lesson.resourceLink
                    ) : (
                      t.lesson.resourceUnavailable
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {view.practiceHref && view.skill && (
          <section aria-labelledby="lesson-practice" className="flex flex-col gap-3 rounded-lg border border-border bg-primary-soft/50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="lesson-practice" className="font-sans text-[15px] font-semibold text-foreground">
                {t.lesson.relatedPractice}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t.lesson.relatedPracticeBody}</p>
            </div>
            <Button asChild variant="secondary" className="self-start sm:self-auto">
              <Link href={view.practiceHref}>{format(t.lesson.relatedPracticeCta, { skill: view.skill.name })}</Link>
            </Button>
          </section>
        )}

        <LessonNavigation t={t} prev={view.prev} next={view.next} course={{ title: view.course.title, href: view.course.href }} />
      </div>
    </article>
  )
}
