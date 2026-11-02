'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookOpen, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { bookmarksDict } from '@/lib/i18n/dictionaries/bookmarks'
import { practiceDict } from '@/lib/i18n/dictionaries/practice'
import { Badge } from '@/components/ui/card'
import { Button, IconButton } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { RichText } from '@/components/learning/rich-text'
import type { SafeQuestion } from '@/types/questions'

export type QuestionBookmarkView = { id: string; createdAt: string; published: boolean; question: SafeQuestion }
export type LessonBookmarkView = { id: string; lessonId: string; title: string; courseTitle: string; durationSeconds: number }

function useRemove() {
  const t = useDict(bookmarksDict)
  const router = useRouter()
  const [pending, setPending] = React.useState<string | null>(null)
  const remove = async (id: string, onDone: () => void) => {
    setPending(id)
    try {
      await apiFetch(`/api/bookmarks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      onDone()
      toast.success(t.removed)
      router.refresh()
    } catch {
      toast.error(t.failed)
    } finally {
      setPending(null)
    }
  }
  return { pending, remove }
}

/** Stem previews only (safe payloads, no answers). */
export function QuestionBookmarkList({ initial, dateLabels }: { initial: QuestionBookmarkView[]; dateLabels: Record<string, string> }) {
  const t = useDict(bookmarksDict).questions
  const tp = useDict(practiceDict)
  const [items, setItems] = React.useState(initial)
  const { pending, remove } = useRemove()
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((b, i) => (
        <li key={b.id} className="flex gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{b.question.skillName}</Badge>
              <Badge variant={b.question.difficulty === 'hard' ? 'warning' : b.question.difficulty === 'easy' ? 'success' : 'neutral'}>
                {tp.difficulty[b.question.difficulty]}
              </Badge>
              {!b.published && <Badge>{t.unavailable}</Badge>}
            </div>
            <div className="mt-2 line-clamp-3 text-sm text-foreground">
              <RichText source={b.question.stem} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {b.question.domainName} · {format(t.saved, { date: dateLabels[b.id] ?? '' })}
            </p>
          </div>
          <IconButton
            size="icon-sm"
            aria-label={format(t.removeLabel, { n: i + 1 })}
            icon={<Trash2 />}
            disabled={pending === b.id}
            onClick={() => void remove(b.id, () => setItems((prev) => prev.filter((x) => x.id !== b.id)))}
          />
        </li>
      ))}
    </ul>
  )
}

export function LessonBookmarkList({ initial }: { initial: LessonBookmarkView[] }) {
  const t = useDict(bookmarksDict).lessons
  const [items, setItems] = React.useState(initial)
  const { pending, remove } = useRemove()
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((l) => (
        <li key={l.id} className="flex items-center gap-3 px-4 py-3">
          <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{l.title}</p>
            <p className="truncate text-xs text-muted-foreground tabular">
              {l.courseTitle}
              {l.durationSeconds > 0 && ` · ${format(t.minutes, { n: Math.max(1, Math.round(l.durationSeconds / 60)) })}`}
            </p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/dashboard/lesson/${l.lessonId}`}>{t.open}</Link>
          </Button>
          <IconButton
            size="icon-sm"
            aria-label={format(t.removeLabel, { title: l.title })}
            icon={<Trash2 />}
            disabled={pending === l.id}
            onClick={() => void remove(l.id, () => setItems((prev) => prev.filter((x) => x.id !== l.id)))}
          />
        </li>
      ))}
    </ul>
  )
}
