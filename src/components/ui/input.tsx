import * as React from 'react'
import { Label as LabelPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-md border border-input bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground/80 ' +
  'transition-colors duration-150 focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 ' +
  'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20'

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(fieldBase, 'h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldBase, 'min-h-24 py-2 leading-relaxed', className)} {...props} />
}

/** Native select — simplest to use with forms and accessible on every device. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        fieldBase,
        'h-10 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%2368748A%27 stroke-width=%272%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

/** Label + control + description + error with proper aria wiring. Pass the control as a render function. */
export function FormField({
  id,
  label,
  description,
  error,
  required,
  className,
  children,
}: {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  error?: string | string[]
  required?: boolean
  className?: string
  children: (aria: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => React.ReactNode
}) {
  const errorText = Array.isArray(error) ? error[0] : error
  const describedBy = [description ? `${id}-description` : null, errorText ? `${id}-error` : null].filter(Boolean).join(' ')
  return (
    <div className={cn('grid grid-cols-1 gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {' '}
            *
          </span>
        )}
      </Label>
      {children({ id, 'aria-invalid': errorText ? true : undefined, 'aria-describedby': describedBy || undefined })}
      {description && !errorText && (
        <p id={`${id}-description`} className="text-[13px] text-muted-foreground">
          {description}
        </p>
      )}
      {errorText && (
        <p id={`${id}-error`} className="text-[13px] text-destructive" role="alert">
          {errorText}
        </p>
      )}
    </div>
  )
}
