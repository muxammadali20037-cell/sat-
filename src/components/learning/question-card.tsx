'use client'

import * as React from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseSprResponse } from '@/lib/scoring'
import { Badge } from '@/components/ui/card'
import { RichText } from './rich-text'
import { AnswerOption, type AnswerOptionState } from './answer-option'
import type { CardQuestion, RevealedAnswer } from '@/types/questions'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { learningDict } from '@/lib/i18n/dictionaries/learning'

export type QuestionCardProps = {
  question: CardQuestion
  number?: number
  total?: number
  selectedOptionId?: string | null
  responseText?: string
  onSelectOption?: (optionId: string) => void
  onResponseChange?: (text: string) => void
  /** When present, shows correct/incorrect states and the explanation. */
  reveal?: RevealedAnswer | null
  disabled?: boolean
  /** Exam tools: answer elimination. */
  eliminated?: ReadonlySet<string>
  onToggleEliminate?: (optionId: string) => void
  /** 'split' puts the passage beside the question on wide screens (exam mode). */
  layout?: 'stacked' | 'split'
  showMeta?: boolean
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

function optionState(optionId: string, props: QuestionCardProps): AnswerOptionState {
  const { reveal, selectedOptionId } = props
  if (reveal) {
    const chosen = reveal.selectedOptionId === optionId
    if (reveal.correctOptionId === optionId) return chosen ? 'correct' : 'missed'
    if (chosen) return 'incorrect'
    return 'idle'
  }
  return selectedOptionId === optionId ? 'selected' : 'idle'
}

export function QuestionCard(props: QuestionCardProps) {
  const { question, number, total, reveal, disabled, layout = 'stacked', showMeta = true } = props
  const t = useDict(learningDict)
  const inputName = `q-${question.id}`
  const hasStimulus = Boolean(question.passage || question.imageUrl)
  const split = layout === 'split' && hasStimulus
  const locked = disabled || Boolean(reveal)

  const stimulus = hasStimulus ? (
    <div className={cn('reading text-foreground', split ? 'lg:pr-8' : 'rounded-lg bg-muted/50 p-4')}>
      {question.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URLs
        <img
          src={question.imageUrl}
          alt={question.imageAlt ?? ''}
          className="mb-3 max-h-80 w-auto max-w-full rounded-md border border-border bg-white object-contain"
        />
      )}
      {question.passage && <RichText source={question.passage} />}
    </div>
  ) : null

  const spr = question.questionType === 'student_produced_response'
  const parsed = spr && props.responseText ? parseSprResponse(props.responseText) : null

  const body = (
    <div className="min-w-0">
      <div className="reading text-[16px] text-foreground">
        <RichText source={question.stem} />
      </div>

      {!spr ? (
        <fieldset className="mt-5 grid grid-cols-1 gap-2.5" disabled={locked}>
          <legend className="sr-only">{t.answerChoices}</legend>
          {question.options.map((option) => (
            <AnswerOption
              key={option.id}
              option={option}
              name={inputName}
              state={optionState(option.id, props)}
              disabled={locked}
              eliminated={props.eliminated?.has(option.id)}
              onSelect={props.onSelectOption}
              onToggleEliminate={reveal ? undefined : props.onToggleEliminate}
            />
          ))}
        </fieldset>
      ) : (
        <div className="mt-5 max-w-xs">
          <label htmlFor={`${inputName}-spr`} className="text-sm font-medium">
            {t.yourAnswer}
          </label>
          <input
            id={`${inputName}-spr`}
            inputMode="decimal"
            autoComplete="off"
            maxLength={7}
            value={props.responseText ?? ''}
            disabled={locked}
            onChange={(e) => props.onResponseChange?.(e.target.value)}
            aria-describedby={`${inputName}-spr-help`}
            className={cn(
              'mt-1.5 h-12 w-full rounded-md border bg-surface px-3 text-lg tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
              reveal ? (reveal.isCorrect ? 'border-success' : 'border-destructive') : 'border-input focus-visible:border-primary',
            )}
          />
          <p id={`${inputName}-spr-help`} className="mt-1.5 min-h-5 text-[13px] text-muted-foreground" aria-live="polite">
            {parsed && !parsed.ok && parsed.reason !== 'empty' ? (
              <span className="text-warning-foreground">{t.spr[parsed.reason as keyof typeof t.spr]}</span>
            ) : parsed?.ok ? (
              <>
                {t.answerPreview} <RichText as="span" source={`$${parsed.normalized.replace(/^(-?)(\d+)\/(\d+)$/, '$1\\frac{$2}{$3}')}$`} />
              </>
            ) : (
              t.sprHelp
            )}
          </p>
          {reveal && !reveal.isCorrect && reveal.acceptedAnswers.length > 0 && (
            <p className="mt-1 text-sm">
              {reveal.acceptedAnswers.length > 1 ? t.acceptedAnswers : t.acceptedAnswer}{' '}
              <span className="font-semibold tabular">{reveal.acceptedAnswers.join(', ')}</span>
            </p>
          )}
        </div>
      )}

      {reveal && (
        <div
          className={cn(
            'mt-6 rounded-lg border p-4',
            reveal.isCorrect ? 'border-success/30 bg-success-soft/60' : 'border-destructive/30 bg-destructive-soft/60',
          )}
        >
          <p className="flex items-center gap-2 font-medium">
            {reveal.isCorrect ? (
              <>
                <CheckCircle2 className="size-4 text-success" aria-hidden /> {t.correct}
              </>
            ) : (
              <>
                <XCircle className="size-4 text-destructive" aria-hidden /> {reveal.selectedOptionId || reveal.responseText ? t.notQuite : t.notAnswered}
              </>
            )}
          </p>
          {reveal.explanation && <RichText source={reveal.explanation} className="reading mt-2 text-[15px] text-foreground" />}
        </div>
      )}
      {props.footer && <div className="mt-6">{props.footer}</div>}
    </div>
  )

  return (
    <article className={cn('rounded-xl border border-border bg-card', props.className)} aria-label={number ? format(t.questionN, { n: number }) : t.question}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 sm:px-5">
        {number !== undefined && (
          <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-navy-900 px-2 text-[13px] font-semibold text-white tabular dark:bg-primary">
            {number}
          </span>
        )}
        {total !== undefined && <span className="text-[13px] text-muted-foreground tabular">{format(t.ofTotal, { total })}</span>}
        {showMeta && (question.skillName || question.difficulty) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {question.skillName && <Badge variant="outline">{question.skillName}</Badge>}
            {question.difficulty && (
              <Badge variant={question.difficulty === 'hard' ? 'warning' : question.difficulty === 'easy' ? 'success' : 'neutral'}>
                {t.difficulty[question.difficulty]}
              </Badge>
            )}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">{props.headerActions}</div>
      </header>
      <div className={cn('p-4 sm:p-6', split && 'lg:grid lg:grid-cols-2 lg:divide-x lg:divide-border lg:p-0')}>
        {split ? (
          <>
            <div className="mb-5 lg:mb-0 lg:max-h-[70vh] lg:overflow-y-auto lg:p-6">{stimulus}</div>
            <div className="lg:max-h-[70vh] lg:overflow-y-auto lg:p-6">{body}</div>
          </>
        ) : (
          <>
            {stimulus && <div className="mb-5">{stimulus}</div>}
            {body}
          </>
        )}
      </div>
    </article>
  )
}
