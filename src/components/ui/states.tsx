import * as React from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

/** Empty states always point to the next action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed border-border-strong px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({
  title = 'This could not load',
  description = 'Try again in a moment. If it keeps happening, contact support.',
  action,
  className,
}: {
  title?: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center rounded-lg border border-destructive/25 bg-destructive-soft px-6 py-10 text-center', className)}>
      <AlertTriangle className="mb-3 size-6 text-destructive" aria-hidden />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
