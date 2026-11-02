'use client'

import * as React from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseSprResponse } from '@/lib/scoring'
import { Badge } from '@/components/ui/card'
import { RichText } from './rich-text'
import { AnswerOption, type AnswerOptionState } from './answer-option'
import { DIFFICULTY_LABELS, type RevealedAnswer, type SafeQuestion } from '@/types/questions'

export type QuestionCardProps = {
  question: SafeQuestion
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

const SPR_REASON: Record<string, string> = {
  too_long: 'Too long: up to 5 characters (6 with a minus sign).',
  invalid: 'Enter a number, decimal or fraction such as 12, .75 or 3/4.',
  mixed_number: 'Mixed numbers are not accepted. Enter 3 1/2 as 7/2 or 3.5.',
  division_by_zero: 'The denominator cannot be zero.',
}

export function QuestionCard(props: QuestionCardProps) {
  const { question, number, total, reveal, disabled, layout = 'stacked', showMeta = true } = props
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
        <fieldset className="mt-5 grid gap-2.5" disabled={locked}>
          <legend className="sr-only">Answer choices</legend>
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
            Your answer
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
              <span className="text-warning-foreground">{SPR_REASON[parsed.reason]}</span>
            ) : parsed?.ok ? (
              <>
                Answer preview: <RichText as="span" source={`$${parsed.normalized.replace(/^(-?)(\d+)\/(\d+)$/, '$1\\frac{$2}{$3}')}$`} />
              </>
            ) : (
              'Numbers, decimals or fractions. No units or commas.'
            )}
          </p>
          {reveal && !reveal.isCorrect && reveal.acceptedAnswers.length > 0 && (
            <p className="mt-1 text-sm">
              Accepted answer{reveal.acceptedAnswers.length > 1 ? 's' : ''}:{' '}
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
                <CheckCircle2 className="size-4 text-success" aria-hidden /> Correct
              </>
            ) : (
              <>
                <XCircle className="size-4 text-destructive" aria-hidden /> {reveal.selectedOptionId || reveal.responseText ? 'Not quite' : 'Not answered'}
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
    <article className={cn('rounded-xl border border-border bg-card', props.className)} aria-label={number ? `Question ${number}` : 'Question'}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 sm:px-5">
        {number !== undefined && (
          <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-navy-900 px-2 text-[13px] font-semibold text-white tabular dark:bg-primary">
            {number}
          </span>
        )}
        {total !== undefined && <span className="text-[13px] text-muted-foreground tabular">of {total}</span>}
        {showMeta && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{question.skillName}</Badge>
            <Badge variant={question.difficulty === 'hard' ? 'warning' : question.difficulty === 'easy' ? 'success' : 'neutral'}>
              {DIFFICULTY_LABELS[question.difficulty]}
            </Badge>
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
