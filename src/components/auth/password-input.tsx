'use client'

import * as React from 'react'
import { Check, Eye, EyeOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { passwordChecks } from '@/features/auth/schemas'

/** Password field with a show/hide toggle (a real button with a state label, ≥ 40px target). */
export function PasswordInput({
  showLabel,
  hideLabel,
  className,
  ...props
}: React.ComponentProps<'input'> & { showLabel: string; hideLabel: string }) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

/** Live checklist under a new-password field; mirrors passwordSchema. */
export function PasswordChecklist({
  password,
  labels,
  id,
}: {
  password: string
  labels: { title: string; length: string; letter: string; number: string }
  id?: string
}) {
  const checks = passwordChecks(password)
  const items: Array<[boolean, string]> = [
    [checks.length, labels.length],
    [checks.letter, labels.letter],
    [checks.number, labels.number],
  ]
  return (
    <div id={id} className="text-[13px] text-muted-foreground">
      <p className="sr-only">{labels.title}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map(([ok, label]) => (
          <li key={label} className={cn('flex items-center gap-1.5', ok && 'text-success')}>
            {ok ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5 opacity-60" aria-hidden />}
            {label}
            <span className="sr-only">{ok ? ' ✓' : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
