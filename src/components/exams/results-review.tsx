'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Flag, MessageCircle, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { examsDict } from '@/lib/i18n/dictionaries/exams'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menus'
import { Button } from '@/components/ui/button'
import { QuestionCard } from '@/components/learning/question-card'
import type { ResultModule } from '@/features/exams/queries'
import { WordLookup } from '@/components/vocab/word-lookup'

/** Post-exam review: per-module tabs, a correctness grid, and the revealed question with its explanation. */
export function ResultsReview({ modules }: { modules: ResultModule[] }) {
  const t = useDict(examsDict)
  const [selected, setSelected] = React.useState<Record<string, number>>({})
  if (modules.length === 0) return null
  return (
    <Tabs defaultValue={modules[0]!.id}>
      <TabsList className="w-full">
        {modules.map((m) => (
          <TabsTrigger key={m.id} value={m.id}>
            {format(t.common.moduleShort, { name: t.sections[m.section], module: m.moduleNumber })}
          </TabsTrigger>
        ))}
      </TabsList>
      {modules.map((m) => {
        const index = Math.min(selected[m.id] ?? 0, Math.max(0, m.questions.length - 1))
        const item = m.questions[index]
        return (
          <TabsContent key={m.id} value={m.id}>
            <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5" aria-label={t.results.reviewTitle}>
              {m.questions.map((q, i) => {
                const state = !q.answered ? 'unanswered' : q.reveal.isCorrect ? 'correct' : 'incorrect'
                return (
                  <li key={q.attemptQuestionId}>
                    <button
                      type="button"
                      onClick={() => setSelected((s) => ({ ...s, [m.id]: i }))}
                      aria-current={i === index ? 'step' : undefined}
                      aria-label={`${q.position}: ${t.results[state]}`}
                      className={cn(
                        'relative flex h-10 w-full items-center justify-center gap-0.5 rounded-md border text-[13px] font-semibold tabular transition-colors',
                        state === 'correct' && 'border-success/40 bg-success-soft text-success',
                        state === 'incorrect' && 'border-destructive/40 bg-destructive-soft text-destructive',
                        state === 'unanswered' && 'border-dashed border-border-strong text-muted-foreground',
                        i === index && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                      )}
                    >
                      {state === 'correct' ? <Check className="size-3" aria-hidden /> : state === 'incorrect' ? <X className="size-3" aria-hidden /> : <Minus className="size-3" aria-hidden />}
                      {q.position}
                      {q.markedForReview && <Flag className="absolute -right-1 -top-1 size-3 fill-warning text-warning" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ol>
            {item && (
              <div className="mt-5">
                <WordLookup source="review" sourceRef={item.question.id}>
                  <QuestionCard
                    key={item.attemptQuestionId}
                    question={item.question}
                    number={item.position}
                    total={m.questions.length}
                    reveal={item.reveal}
                    selectedOptionId={item.reveal.selectedOptionId}
                    responseText={item.reveal.responseText ?? ''}
                    layout="split"
                    footer={
                      item.answered ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href={`/dashboard/ai-tutor?questionId=${item.question.id}`}>
                            <MessageCircle /> {t.results.askTutor}
                          </Link>
                        </Button>
                      ) : null
                    }
                  />
                </WordLookup>
              </div>
            )}
          </TabsContent>
        )
      })}
    </Tabs>
  )
}
