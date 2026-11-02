import * as React from 'react'
import { ShieldAlert } from 'lucide-react'
import { Alert } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Heading + body block used by every auth screen. */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  className,
}: {
  title: string
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('w-full max-w-[400px]', className)}>
      <h1 className="text-[26px] font-semibold leading-tight text-foreground sm:text-[28px]">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>}
      <div className="mt-7">{children}</div>
      {footer && <div className="mt-7 border-t border-border pt-5 text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}

export function NotConfiguredAlert({ message }: { message: string }) {
  return <Alert variant="warning" icon={<ShieldAlert className="text-warning-foreground" />} title={message} className="mb-5" />
}

/** Form-level error with an optional action (e.g. resend confirmation). Announced to screen readers. */
export function FormError({ message, action }: { message: string | null; action?: React.ReactNode }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive-soft px-3.5 py-3 text-sm text-foreground">
      <p>{message}</p>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}
