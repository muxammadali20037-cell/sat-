'use client'

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RichText } from './rich-text'
import type { SafeOption } from '@/types/questions'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { learningDict } from '@/lib/i18n/dictionaries/learning'

export type AnswerOptionState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'missed'

/**
 * One multiple-choice option. Semantically a radio input (keyboard + screen readers).
 * `missed` = the correct option the student did not choose (shown after reveal).
 */
export function AnswerOption({
  option,
  name,
  state,
  disabled,
  eliminated,
  onSelect,
  onToggleEliminate,
}: {
  option: SafeOption
  name: string
  state: AnswerOptionState
  disabled?: boolean
  eliminated?: boolean
  onSelect?: (optionId: string) => void
  onToggleEliminate?: (optionId: string) => void
}) {
  const t = useDict(learningDict)
  const checked = state === 'selected' || state === 'correct' || state === 'incorrect'
  return (
    <div className="flex items-stretch gap-2">
      <label
        className={cn(
          'group relative flex min-h-12 flex-1 cursor-pointer items-start gap-3 rounded-lg border bg-surface px-3.5 py-3 text-[15px] transition-colors duration-150',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
          state === 'idle' && 'border-border hover:border-border-strong hover:bg-muted/40',
          state === 'selected' && 'border-primary bg-primary-soft',
          state === 'correct' && 'border-success bg-success-soft',
          state === 'incorrect' && 'border-destructive bg-destructive-soft',
          state === 'missed' && 'border-success border-dashed',
          disabled && 'cursor-default',
          eliminated && state === 'idle' && 'opacity-55',
        )}
      >
        <input
          type="radio"
          name={name}
          value={option.id}
          checked={checked}
          disabled={disabled}
          onChange={() => onSelect?.(option.id)}
          className="sr-only"
        />
        <span
          aria-hidden
          className={cn(
            'mt-px flex size-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold',
            state === 'idle' && 'border-border-strong text-muted-foreground',
            state === 'selected' && 'border-primary bg-primary text-primary-foreground',
            state === 'correct' && 'border-success bg-success text-white',
            state === 'incorrect' && 'border-destructive bg-destructive text-white',
            state === 'missed' && 'border-success text-success',
          )}
        >
          {state === 'correct' ? <Check className="size-4" /> : state === 'incorrect' ? <X className="size-4" /> : option.label}
        </span>
        <span className={cn('min-w-0 flex-1 pt-0.5 leading-relaxed', eliminated && 'line-through decoration-muted-foreground/70')}>
          <span className="sr-only">{format(t.option, { label: option.label })} </span>
          <RichText source={option.content} as="span" />
        </span>
        {state === 'correct' && <span className="sr-only">{t.srCorrectChosen}</span>}
        {state === 'incorrect' && <span className="sr-only">{t.srIncorrectChosen}</span>}
        {state === 'missed' && <span className="sr-only">{t.srCorrect}</span>}
      </label>
      {onToggleEliminate && !disabled && (
        <button
          type="button"
          onClick={() => onToggleEliminate(option.id)}
          aria-pressed={eliminated}
          aria-label={format(eliminated ? t.restore : t.eliminate, { label: option.label })}
          className="w-10 shrink-0 rounded-lg text-[13px] font-semibold text-muted-foreground hover:bg-muted"
        >
          <span className={cn(eliminated ? 'no-underline' : 'line-through')}>{option.label}</span>
        </button>
      )}
    </div>
  )
}
