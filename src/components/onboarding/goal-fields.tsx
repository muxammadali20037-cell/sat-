'use client'

import * as React from 'react'
import { Checkbox } from '@/components/ui/controls'
import { Input, Label } from '@/components/ui/input'
import { useDict } from '@/lib/i18n/client'
import { format } from '@/lib/i18n/dict'
import { onboardingDict } from '@/lib/i18n/dictionaries/onboarding'
import { addDays, daysBetween } from '@/lib/time'
import {
  clampScore,
  EXAM_DATE_MAX_DAYS,
  MINUTE_PRESETS,
  MINUTES_MAX,
  MINUTES_MIN,
  SCORE_MAX,
  SCORE_MIN,
  SCORE_STEP,
  type Subject,
} from '@/features/onboarding/schemas'
import { ChipRadios, ChoiceCards } from './choice-cards'
import { ScoreScale } from './score-scale'

/**
 * Learning-goal inputs shared by onboarding and Settings. Errors arrive as message keys
 * (from the Zod schemas) or as already-localized strings; both are displayed correctly.
 */

export function useGoalMessages() {
  const t = useDict(onboardingDict)
  const errors = t.errors as Record<string, string>
  return { t, message: (key: string | undefined) => (key ? (errors[key] ?? key) : undefined) }
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-[13px] text-destructive">
      {message}
    </p>
  )
}

export function TargetScoreField({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: number
  onChange: (value: number) => void
  error?: string
}) {
  const { t, message } = useGoalMessages()
  const [text, setText] = React.useState(Number.isFinite(value) ? String(value) : '')
  const errorId = `${id}-error`
  const sliderValue = Number.isFinite(value) ? clampScore(value) : 1200
  return (
    <div className="grid grid-cols-1 gap-4">
      <ScoreScale score={Number.isFinite(value) ? value : null} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem] sm:items-end">
        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor={`${id}-slider`} className="sr-only">
            {t.steps.target.sliderLabel}
          </Label>
          <input
            id={`${id}-slider`}
            type="range"
            min={SCORE_MIN}
            max={SCORE_MAX}
            step={SCORE_STEP}
            value={sliderValue}
            onChange={(e) => {
              const next = Number(e.target.value)
              setText(String(next))
              onChange(next)
            }}
            aria-valuetext={String(sliderValue)}
            className="h-10 w-full cursor-pointer accent-primary"
          />
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <Label htmlFor={id}>{t.steps.target.label}</Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={SCORE_MIN}
            max={SCORE_MAX}
            step={SCORE_STEP}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : `${id}-hint`}
            className="text-base font-semibold tabular"
          />
        </div>
      </div>
      {error ? (
        <FieldError id={errorId} message={message(error)} />
      ) : (
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {t.steps.target.hint}
        </p>
      )}
    </div>
  )
}

export function ExamDateField({
  id,
  today,
  date,
  undecided,
  onDateChange,
  onUndecidedChange,
  error,
}: {
  id: string
  today: string
  date: string
  undecided: boolean
  onDateChange: (value: string) => void
  onUndecidedChange: (value: boolean) => void
  error?: string
}) {
  const { t, message } = useGoalMessages()
  const errorId = `${id}-error`
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date > today
  const days = valid ? daysBetween(today, date) : null
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 gap-1.5">
        <Label htmlFor={id}>{t.steps.examDate.label}</Label>
        <Input
          id={id}
          type="date"
          min={addDays(today, 1)}
          max={addDays(today, EXAM_DATE_MAX_DAYS)}
          value={undecided ? '' : date}
          disabled={undecided}
          onChange={(e) => onDateChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="max-w-xs"
        />
        {!undecided && days !== null && <p className="text-[13px] text-muted-foreground tabular">{format(t.steps.examDate.daysLeft, { n: days })}</p>}
        <FieldError id={errorId} message={message(error)} />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${id}-undecided`}
          checked={undecided}
          onCheckedChange={(v) => onUndecidedChange(v === true)}
          className="mt-0.5 size-5"
          aria-describedby={`${id}-undecided-hint`}
        />
        <div>
          <Label htmlFor={`${id}-undecided`}>{t.steps.examDate.undecided}</Label>
          <p id={`${id}-undecided-hint`} className="text-[13px] text-muted-foreground">
            {t.steps.examDate.undecidedHint}
          </p>
        </div>
      </div>
    </div>
  )
}

export function DailyMinutesField({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: number | null
  onChange: (value: number | null) => void
  error?: string
}) {
  const { t, message } = useGoalMessages()
  const isPreset = value !== null && (MINUTE_PRESETS as readonly number[]).includes(value)
  const [custom, setCustom] = React.useState(value !== null && !isPreset)
  const [customText, setCustomText] = React.useState(value !== null && !isPreset ? String(value) : '')
  const errorId = `${id}-error`
  const choice = custom ? 'custom' : isPreset ? String(value) : null
  const options = [
    ...MINUTE_PRESETS.map((m) => ({ value: String(m), label: `${m} ${t.steps.minutes.unit}` })),
    { value: 'custom', label: t.steps.minutes.custom },
  ]
  return (
    <div className="grid grid-cols-1 gap-4">
      <ChipRadios
        name={`${id}-preset`}
        legend={t.steps.minutes.title}
        value={choice}
        options={options}
        onChange={(v) => {
          if (v === 'custom') {
            setCustom(true)
            onChange(customText === '' ? null : Number(customText))
          } else {
            setCustom(false)
            onChange(Number(v))
          }
        }}
      />
      {custom && (
        <div className="grid grid-cols-1 max-w-xs gap-1.5">
          <Label htmlFor={id}>{t.steps.minutes.customLabel}</Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={MINUTES_MIN}
            max={MINUTES_MAX}
            step={5}
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value)
              onChange(e.target.value === '' ? null : Number(e.target.value))
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="tabular"
          />
        </div>
      )}
      {value !== null && Number.isFinite(value) && !error && (
        <p className="text-[13px] text-muted-foreground tabular">{format(t.steps.minutes.perDay, { n: value })}</p>
      )}
      <FieldError id={errorId} message={message(error)} />
    </div>
  )
}

export type SubjectChoice = 'both' | Subject

export function subjectsToChoice(subjects: readonly Subject[]): SubjectChoice | null {
  if (subjects.length === 2) return 'both'
  if (subjects.length === 1) return subjects[0]!
  return null
}

export function choiceToSubjects(choice: SubjectChoice): Subject[] {
  return choice === 'both' ? ['math', 'reading_writing'] : [choice]
}

export function SubjectsField({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: Subject[]
  onChange: (value: Subject[]) => void
  error?: string
}) {
  const { t, message } = useGoalMessages()
  const s = t.steps.subjects
  return (
    <div className="grid grid-cols-1 gap-3">
      <ChoiceCards<SubjectChoice>
        name={id}
        legend={s.title}
        value={subjectsToChoice(value)}
        invalid={Boolean(error)}
        describedBy={error ? `${id}-error` : undefined}
        onChange={(choice) => onChange(choiceToSubjects(choice))}
        options={[
          { value: 'both', title: s.both.title, body: s.both.body },
          { value: 'math', title: s.math.title, body: s.math.body },
          { value: 'reading_writing', title: s.reading_writing.title, body: s.reading_writing.body },
        ]}
      />
      <FieldError id={`${id}-error`} message={message(error)} />
    </div>
  )
}
