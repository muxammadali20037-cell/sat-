import type { Metadata } from 'next'
import Link from 'next/link'
import { Bookmark, BookOpen } from 'lucide-react'
import { requireStudentReady } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getDict, getLocale } from '@/lib/i18n/server'
import { format } from '@/lib/i18n/dict'
import { bookmarksDict } from '@/lib/i18n/dictionaries/bookmarks'
import { PageHeader, Section } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'
import { listBookmarks } from '@/features/bookmarks/server'
import { StartPracticeButton } from '@/components/practice/start-practice-button'
import { LessonBookmarkList, QuestionBookmarkList } from '@/components/practice/bookmark-lists'

export const metadata: Metadata = { title: 'Bookmarks' }

export default async function BookmarksPage() {
  const profile = await requireStudentReady({ next: '/dashboard/bookmarks' })
  const [t, locale] = await Promise.all([getDict(bookmarksDict), getLocale()])
  const { questions, lessons } = await listBookmarks(createAdminSupabase(), profile.id)
  const dateFormat = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-UZ' : 'en-US', { dateStyle: 'medium' })
  const dateLabels = Object.fromEntries(questions.map((q) => [q.id, dateFormat.format(new Date(q.createdAt))]))
  const practisable = questions.filter((q) => q.published).length

  return (
    <div className="space-y-8">
      <PageHeader title={t.title} description={t.description} />

      <Section
        title={t.questions.title}
        description={questions.length > 0 ? format(t.questions.count, { n: questions.length }) : undefined}
        actions={
          practisable > 0 ? (
            <StartPracticeButton request={{ mode: 'bookmarks' }} size="sm">
              {t.questions.practise}
            </StartPracticeButton>
          ) : undefined
        }
      >
        {questions.length === 0 ? (
          <EmptyState
            icon={<Bookmark />}
            title={t.questions.empty}
            description={t.questions.emptyBody}
            action={
              <Button asChild>
                <Link href="/dashboard/practice">{t.questions.startPractice}</Link>
              </Button>
            }
          />
        ) : (
          <QuestionBookmarkList
            initial={questions.map((q) => ({ id: q.id, createdAt: q.createdAt, published: q.published, question: q.question }))}
            dateLabels={dateLabels}
          />
        )}
      </Section>

      <Section title={t.lessons.title} description={lessons.length > 0 ? format(t.lessons.count, { n: lessons.length }) : undefined}>
        {lessons.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title={t.lessons.empty}
            description={t.lessons.emptyBody}
            action={
              <Button asChild variant="secondary">
                <Link href="/dashboard/courses">{t.lessons.browse}</Link>
              </Button>
            }
          />
        ) : (
          <LessonBookmarkList
            initial={lessons.map((l) => ({ id: l.id, lessonId: l.lessonId, title: l.title, courseTitle: l.courseTitle, durationSeconds: l.durationSeconds }))}
          />
        )}
      </Section>
    </div>
  )
}
