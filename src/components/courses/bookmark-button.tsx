'use client'

import * as React from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useDict } from '@/lib/i18n/client'
import { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { setLessonBookmarkAction } from '@/features/lessons/actions'

export function BookmarkButton({ lessonId, initial }: { lessonId: string; initial: boolean }) {
  const t = useDict(coursesDict)
  const [bookmarked, setBookmarked] = React.useState(initial)
  const [pending, startTransition] = React.useTransition()

  const toggle = () => {
    const next = !bookmarked
    startTransition(async () => {
      const res = await setLessonBookmarkAction({ lessonId, bookmarked: next })
      if (res.ok) {
        setBookmarked(next)
        toast.success(next ? t.lesson.bookmarkSaved : t.lesson.bookmarkRemoved)
      } else {
        toast.error(t.lesson.bookmarkFailed)
      }
    })
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={toggle}
      loading={pending}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? t.lesson.bookmarkRemove : t.lesson.bookmarkAdd}
    >
      {!pending && (bookmarked ? <BookmarkCheck className="text-primary" aria-hidden /> : <Bookmark aria-hidden />)}
      {bookmarked ? t.lesson.bookmarked : t.lesson.bookmark}
    </Button>
  )
}
