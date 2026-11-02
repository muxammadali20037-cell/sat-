import * as React from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 select-none ' +
    'disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
    '[&_svg]:shrink-0 [&_svg]:size-4',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'border border-border-strong bg-surface text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
        navy: 'bg-navy-900 text-white hover:bg-navy-800 dark:bg-primary dark:text-primary-foreground',
        link: 'text-primary underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-[13px]',
        md: 'h-10 rounded-md px-4 text-sm',
        lg: 'h-12 rounded-md px-6 text-[15px]',
        icon: 'size-10 rounded-md',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }

export function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  )
}

export type IconButtonProps = Omit<ButtonProps, 'size' | 'children'> & {
  'aria-label': string
  icon: React.ReactNode
  size?: 'icon' | 'icon-sm'
}

export function IconButton({ icon, size = 'icon', variant = 'ghost', ...props }: IconButtonProps) {
  return (
    <Button size={size} variant={variant} {...props}>
      {icon}
    </Button>
  )
}
