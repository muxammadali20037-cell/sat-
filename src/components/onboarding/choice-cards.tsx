'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Radio cards built on native radio inputs (arrow keys, screen readers and forms work for free). */
export function ChoiceCards<T extends string>({
  name,
  value,
  options,
  onChange,
  legend,
  describedBy,
  invalid,
  columns = 1,
}: {
  name: string
  value: T | null
  options: Array<{ value: T; title: string; body?: string; badge?: string }>
  onChange: (value: T) => void
  legend: string
  describedBy?: string
  invalid?: boolean
  columns?: 1 | 2 | 3
}) {
  return (
    <fieldset aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      <legend className="sr-only">{legend}</legend>
      <div className={cn('grid grid-cols-1 gap-2.5', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}>
        {options.map((option) => {
          const checked = value === option.value
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex min-h-12 cursor-pointer gap-3 rounded-lg border bg-surface p-4 transition-colors duration-150',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                checked ? 'border-primary bg-primary-soft' : 'border-border hover:border-border-strong',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
                )}
              >
                {checked && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  {option.title}
                  {option.badge && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{option.badge}</span>}
                </span>
                {option.body && <span className="mt-0.5 block text-sm text-muted-foreground">{option.body}</span>}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Compact pill radios (daily minutes presets). */
export function ChipRadios<T extends string>({
  name,
  value,
  options,
  onChange,
  legend,
}: {
  name: string
  value: T | null
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  legend: string
}) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = value === option.value
          return (
            <label
              key={option.value}
              className={cn(
                'inline-flex h-10 min-w-16 cursor-pointer items-center justify-center rounded-md border px-3.5 text-sm font-medium tabular transition-colors duration-150',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong bg-surface text-foreground hover:bg-muted',
              )}
            >
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
              {option.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
