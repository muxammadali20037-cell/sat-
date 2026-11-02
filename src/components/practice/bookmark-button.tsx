'use client'

import * as React from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { IconButton } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

/** Toggles a question bookmark. The server only accepts questions from the student's own attempts. */
export function BookmarkButton({
  questionId,
  bookmarked,
  onChange,
}: {
  questionId: string
  bookmarked: boolean
  onChange: (bookmarked: boolean) => void
}) {
  const t = useDict(practiceDict).bookmark
  const [pending, setPending] = React.useState(false)

  async function toggle() {
    setPending(true)
    try {
      const res = await apiFetch<{ bookmarked: boolean }>('/api/bookmarks', { method: 'POST', body: { questionId } })
      onChange(res.bookmarked)
      toast.success(res.bookmarked ? t.added : t.removed)
    } catch {
      toast.error(t.failed)
    } finally {
      setPending(false)
    }
  }

  return (
    <IconButton
      size="icon-sm"
      variant="ghost"
      aria-label={bookmarked ? t.remove : t.add}
      aria-pressed={bookmarked}
      disabled={pending}
      onClick={() => void toggle()}
      icon={bookmarked ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
    />
  )
}
