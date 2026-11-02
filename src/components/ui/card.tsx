import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-border bg-card text-card-foreground', className)} {...props} />
}
export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
}
export function CardTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 className={cn('font-sans text-base font-semibold tracking-normal', className)} {...props} />
}
export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}
export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />
}
export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 border-t border-border px-5 py-3', className)} {...props} />
}

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        primary: 'bg-primary-soft text-primary',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning-foreground',
        destructive: 'bg-destructive-soft text-destructive',
        outline: 'border border-border text-foreground',
        navy: 'bg-navy-900 text-white',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export function Separator({ className, vertical, ...props }: React.ComponentProps<'div'> & { vertical?: boolean }) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={cn('shrink-0 bg-border', vertical ? 'h-full w-px' : 'h-px w-full', className)}
      {...props}
    />
  )
}

/** Inline notice for explanations, warnings and "not configured" states. */
export function Alert({
  variant = 'neutral',
  title,
  children,
  icon,
  className,
  action,
}: {
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'destructive'
  title?: React.ReactNode
  children?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  action?: React.ReactNode
}) {
  const styles = {
    neutral: 'border-border bg-muted/60',
    primary: 'border-primary/25 bg-primary-soft',
    success: 'border-success/25 bg-success-soft',
    warning: 'border-warning/30 bg-warning-soft',
    destructive: 'border-destructive/25 bg-destructive-soft',
  }[variant]
  return (
    <div role={variant === 'destructive' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border p-4 text-sm', styles, className)}>
      {icon && <div className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</div>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children && <div className={cn('text-muted-foreground', title && 'mt-1')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
