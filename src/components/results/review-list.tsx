'use client'

import * as React from 'react'
import Link from 'next/link'
import { Clock, Flag, Sparkles } from 'lucide-react'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { resultsDict } from '@/lib/i18n/dictionaries/results'
import { cn, formatDuration } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { QuestionCard } from '@/components/learning/question-card'
import type { RevealedAnswer, SafeQuestion } from '@/types/questions'

export type ReviewEntry = {
  position: number
  question: SafeQuestion
  answered: boolean
  markedForReview: boolean
  timeSpentSeconds: number
  reveal: RevealedAnswer
}

type Filter = 'all' | 'incorrect' | 'correct'

/** Post-submission review: only entries whose reveal the server allowed are ever passed in. */
export function ReviewList({ entries, showTime }: { entries: ReviewEntry[]; showTime: boolean }) {
  const t = useDict(resultsDict).detail
  const [filter, setFilter] = React.useState<Filter>('all')
  const counts = {
    all: entries.length,
    incorrect: entries.filter((e) => e.reveal.isCorrect !== true).length,
    correct: entries.filter((e) => e.reveal.isCorrect === true).length,
  }
  const shown = entries.filter((e) => (filter === 'all' ? true : filter === 'correct' ? e.reveal.isCorrect === true : e.reveal.isCorrect !== true))

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label={t.reviewFilter.label} className="flex flex-wrap gap-2">
        {(['all', 'incorrect', 'correct'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
              filter === f ? 'border-primary bg-primary-soft font-medium text-primary' : 'border-border hover:bg-muted',
            )}
          >
            {t.reviewFilter[f]}
            <span className="text-xs tabular opacity-80">{counts[f]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={filter === 'incorrect' ? t.noneIncorrect : t.noneCorrect} />
      ) : (
        <ol className="space-y-4">
          {shown.map((e) => (
            <li key={e.question.id}>
              <QuestionCard
                question={e.question}
                number={e.position}
                reveal={e.reveal}
                selectedOptionId={e.reveal.selectedOptionId}
                responseText={e.reveal.responseText ?? ''}
                disabled
                headerActions={
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    {e.markedForReview && (
                      <Badge variant="warning">
                        <Flag aria-hidden /> {t.flagged}
                      </Badge>
                    )}
                    {showTime && e.timeSpentSeconds > 0 && (
                      <span className="flex items-center gap-1 tabular">
                        <Clock className="size-3.5" aria-hidden />
                        <span className="sr-only">{format(t.timeOn, { time: formatDuration(e.timeSpentSeconds) })}</span>
                        <span aria-hidden>{formatDuration(e.timeSpentSeconds)}</span>
                      </span>
                    )}
                  </div>
                }
                footer={
                  e.answered ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/dashboard/ai-tutor?questionId=${e.question.id}`}>
                        <Sparkles aria-hidden /> {t.askAi}
                      </Link>
                    </Button>
                  ) : null
                }
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
