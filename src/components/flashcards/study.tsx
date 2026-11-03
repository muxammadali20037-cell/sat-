'use client'

import * as React from 'react'
import Link from 'next/link'
import { CircleCheck } from 'lucide-react'
import { apiFetch } from '@/lib/api/client'
import { useDict } from '@/lib/i18n/client'
import { format, plural } from '@/lib/i18n/dict'
import { flashcardsDict } from '@/lib/i18n/dictionaries/flashcards'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress'
import { toast } from '@/components/ui/toast'
import { RichText } from '@/components/learning/rich-text'
import type { LocalCard } from '@/features/flashcards/content'
import type { Grade } from '@/features/flashcards/srs'

const GRADE_ORDER: Grade[] = ['again', 'hard', 'good', 'easy']

/**
 * One card at a time: front → "Show answer" → grade. The server schedules the next review.
 * Cards graded "Again" come back at the end of this session.
 */
export function FlashcardStudy({ cards }: { cards: LocalCard[] }) {
  const t = useDict(flashcardsDict)
  const [queue, setQueue] = React.useState(cards)
  const [index, setIndex] = React.useState(0)
  const [revealed, setRevealed] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [reviewed, setReviewed] = React.useState(0)
  const shownAt = React.useRef(0)

  const card = queue[index]
  React.useEffect(() => {
    shownAt.current = Date.now()
  }, [index])

  async function grade(g: Grade) {
    if (!card || saving) return
    setSaving(true)
    try {
      await apiFetch('/api/flashcards/review', {
        method: 'POST',
        body: { cardKey: card.key, grade: g, seconds: Math.round((Date.now() - shownAt.current) / 1000) },
      })
      setReviewed((n) => n + 1)
      if (g === 'again') setQueue((q) => [...q, card])
      setRevealed(false)
      setIndex((i) => i + 1)
    } catch {
      toast.error(t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  const onKey = React.useEffectEvent((e: KeyboardEvent) => {
    if (!card || e.metaKey || e.ctrlKey || e.altKey) return
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
    if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
      if (target && target.tagName === 'BUTTON') return
      e.preventDefault()
      setRevealed(true)
      return
    }
    if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault()
      void grade(GRADE_ORDER[Number(e.key) - 1]!)
    }
  })
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (!card) {
    return (
      <Card className="mx-auto flex max-w-xl flex-col items-center gap-3 p-8 text-center">
        <CircleCheck className="size-8 text-success" aria-hidden />
        <h2 className="text-lg font-semibold">{t.doneTitle}</h2>
        <p className="text-sm text-muted-foreground">{plural(reviewed, t.doneBody)}</p>
        <Button asChild variant="secondary">
          <Link href="/dashboard/flashcards">{t.back}</Link>
        </Button>
      </Card>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <ProgressBar value={index} max={queue.length} label={format(t.progress, { n: index + 1, total: queue.length })} size="sm" />
        <span className="shrink-0 text-xs text-muted-foreground tabular">{format(t.progress, { n: index + 1, total: queue.length })}</span>
      </div>

      <Card className="flex min-h-72 flex-col p-6 sm:p-8" aria-live="polite">
        <RichText source={card.front} className="text-center text-xl font-semibold leading-snug text-foreground sm:text-2xl" />
        {revealed ? (
          <div className="mt-6 border-t border-border pt-6">
            <RichText source={card.back} className="text-[15px] leading-relaxed text-foreground" />
            {card.example && (
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{t.example}: </span>
                <span lang="en">{card.example}</span>
              </p>
            )}
          </div>
        ) : (
          <div className="mt-auto flex justify-center pt-8">
            <Button size="lg" onClick={() => setRevealed(true)}>
              {t.showAnswer}
            </Button>
          </div>
        )}
      </Card>

      {revealed && (
        <div>
          <p className="mb-2 text-center text-[13px] text-muted-foreground">{t.gradePrompt}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GRADE_ORDER.map((g, i) => (
              <Button
                key={g}
                variant={g === 'good' ? 'primary' : 'secondary'}
                disabled={saving}
                onClick={() => void grade(g)}
                className={cn('h-auto flex-col gap-0 py-2', g === 'again' && 'text-destructive')}
              >
                <span className="text-sm font-semibold">
                  <span className="sr-only">{i + 1}. </span>
                  {t.grades[g]}
                </span>
                <span className="text-[11px] font-normal opacity-80">{t.gradeHints[g]}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
      <p className="hidden text-center text-xs text-muted-foreground sm:block">{t.keyboard}</p>
    </div>
  )
}
