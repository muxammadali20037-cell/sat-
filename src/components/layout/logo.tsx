import Link from 'next/link'
import { cn } from '@/lib/utils'

/** Mark: a 2×2 question navigator — three answered squares and the current one in blue. */
export function LogoMark({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden>
      <rect x="2" y="2" width="9" height="9" rx="2" className={onDark ? 'fill-white' : 'fill-navy-900 dark:fill-white'} />
      <rect x="13" y="2" width="9" height="9" rx="2" className={onDark ? 'fill-white' : 'fill-navy-900 dark:fill-white'} />
      <rect x="2" y="13" width="9" height="9" rx="2" className={onDark ? 'fill-white' : 'fill-navy-900 dark:fill-white'} />
      <rect x="13" y="13" width="9" height="9" rx="2" className="fill-primary" />
    </svg>
  )
}

export function Logo({ href = '/', onDark, className }: { href?: string; onDark?: boolean; className?: string }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2 rounded-md', className)} aria-label="SAT MASTER home">
      <LogoMark onDark={onDark} />
      <span className={cn('font-display text-[15px] font-semibold tracking-[0.04em]', onDark ? 'text-white' : 'text-navy-900 dark:text-white')}>
        SAT MASTER
      </span>
    </Link>
  )
}
