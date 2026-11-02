'use client'

import * as React from 'react'
import { Clock, Flag, Lightbulb, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { QuestionCard } from '@/components/learning/question-card'
import { QuestionNavigator, type NavigatorItem } from '@/components/learning/question-navigator'
import { RichText } from '@/components/learning/rich-text'
import { format } from '@/lib/i18n/dict'
import type { RevealedAnswer, SafeQuestion } from '@/types/questions'

/*
 * MARKETING DEMO CONTENT — NOT FROM THE QUESTION BANK.
 * This is an original, standalone sample item written for the homepage. Its answer key lives
 * in client code on purpose: it is public marketing content and is never served by, stored in,
 * or reused from the real question bank (whose keys are only ever revealed server-side).
 */
const DEMO_QUESTION: SafeQuestion = {
  id: 'marketing-demo-posters',
  subjectCode: 'math',
  domainId: 'demo',
  domainName: 'Algebra',
  skillId: 'demo',
  skillName: 'Linear equations in one variable',
  difficulty: 'medium',
  questionType: 'multiple_choice',
  stimulusType: 'text',
  stem: 'A print shop charges a one-time setup fee plus a fixed price per poster. The total cost $C$, in dollars, of printing $p$ posters is given by $C = 2.5p + 18$. A school club paid a total of \\$93 for one order. How many posters did the club order?',
  passage: null,
  imageUrl: null,
  imageAlt: null,
  estimatedSeconds: 75,
  options: [
    { id: 'demo-a', label: 'A', content: '30' },
    { id: 'demo-b', label: 'B', content: '37' },
    { id: 'demo-c', label: 'C', content: '44' },
    { id: 'demo-d', label: 'D', content: '75' },
  ],
}
const DEMO_CORRECT_OPTION = 'demo-a'
const DEMO_NUMBER = 7
const DEMO_TOTAL = 22

/** Fictional module progress for the side panel (clearly labelled as sample data). */
const SAMPLE_NAVIGATOR: NavigatorItem[] = Array.from({ length: DEMO_TOTAL }, (_, index) => ({
  index,
  answered: index < DEMO_NUMBER - 1 && index !== 3,
  flagged: index === 2 || index === 5,
}))

export type HeroDemoLabels = {
  section: string
  module: string
  timerLabel: string
  questionOf: string
  markForReview: string
  marked: string
  showHint: string
  hideHint: string
  hintTitle: string
  hint: string
  check: string
  tryAgain: string
  chooseFirst: string
  explanation: string
  source: string
  panelTitle: string
  panelBody: string
  panelHint: string
  preview: string
  sampleData: string
}

export function HeroDemo({ labels }: { labels: HeroDemoLabels }) {
  const [selected, setSelected] = React.useState<string | null>(null)
  const [reveal, setReveal] = React.useState<RevealedAnswer | null>(null)
  const [hintOpen, setHintOpen] = React.useState(false)
  const [flagged, setFlagged] = React.useState(false)
  const [nudge, setNudge] = React.useState(false)
  const hintId = React.useId()

  const check = () => {
    if (!selected) {
      setNudge(true)
      return
    }
    setNudge(false)
    setReveal({
      questionId: DEMO_QUESTION.id,
      isCorrect: selected === DEMO_CORRECT_OPTION,
      selectedOptionId: selected,
      responseText: null,
      correctOptionId: DEMO_CORRECT_OPTION,
      acceptedAnswers: [],
      explanation: labels.explanation,
    })
  }

  const retry = () => {
    setReveal(null)
    setSelected(null)
    setHintOpen(false)
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
        {/* Exam-style module bar (decorative timer) */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
          <p className="min-w-0 truncate text-[13px] font-medium text-foreground">
            {labels.section} <span className="text-muted-foreground">· {labels.module}</span>
          </p>
          <span aria-hidden title={labels.timerLabel} className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[13px] font-semibold text-foreground tabular">
            <Clock className="size-3.5 text-muted-foreground" />
            31:58
          </span>
        </div>
        <QuestionCard
          question={DEMO_QUESTION}
          number={DEMO_NUMBER}
          total={DEMO_TOTAL}
          selectedOptionId={selected}
          onSelectOption={(id) => {
            setSelected(id)
            setNudge(false)
          }}
          reveal={reveal}
          className="rounded-none border-0"
          headerActions={
            <button
              type="button"
              onClick={() => setFlagged((f) => !f)}
              aria-pressed={flagged}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150',
                flagged ? 'text-warning-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Flag className={cn('size-4', flagged && 'fill-warning text-warning')} aria-hidden />
              <span className="hidden sm:inline">{flagged ? labels.marked : labels.markForReview}</span>
              <span className="sr-only sm:hidden">{flagged ? labels.marked : labels.markForReview}</span>
            </button>
          }
          footer={
            <div className="grid grid-cols-1 gap-3">
              {hintOpen && !reveal && (
                <div id={hintId} className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft p-3.5 text-sm">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
                  <div>
                    <p className="font-medium text-foreground">{labels.hintTitle}</p>
                    <RichText source={labels.hint} className="mt-0.5 text-foreground/90" />
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {!reveal ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setHintOpen((o) => !o)}
                      aria-expanded={hintOpen}
                      aria-controls={hintOpen ? hintId : undefined}
                    >
                      <Lightbulb aria-hidden />
                      {hintOpen ? labels.hideHint : labels.showHint}
                    </Button>
                    <Button type="button" onClick={check}>
                      {labels.check}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="secondary" onClick={retry} className="ml-auto">
                    <RotateCcw aria-hidden />
                    {labels.tryAgain}
                  </Button>
                )}
              </div>
              <p aria-live="polite" className={cn('text-[13px] text-warning-foreground', !nudge && 'sr-only')}>
                {nudge ? labels.chooseFirst : ''}
              </p>
            </div>
          }
        />
      </div>

      <aside className="min-w-0 rounded-xl border border-border bg-surface p-4" aria-label={labels.panelTitle}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{labels.preview}</Badge>
          <span className="text-xs font-medium text-muted-foreground">{labels.sampleData}</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-foreground">{labels.panelTitle}</p>
        <p className="text-[13px] text-muted-foreground tabular">{labels.panelBody}</p>
        <div className="mt-4" inert>
          <QuestionNavigator
            items={SAMPLE_NAVIGATOR.map((item) => (item.index === DEMO_NUMBER - 1 ? { ...item, flagged, answered: Boolean(reveal) } : item))}
            current={DEMO_NUMBER - 1}
            onJump={() => undefined}
          />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{labels.panelHint}</p>
        <p className="sr-only">{format(labels.questionOf, { n: DEMO_NUMBER, total: DEMO_TOTAL })}</p>
      </aside>
    </div>
  )
}
