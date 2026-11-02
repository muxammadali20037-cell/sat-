import * as React from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/card'

/** Full-width marketing section with a left-aligned heading block. */
export function MarketingSection({
  id,
  title,
  description,
  aside,
  tone = 'canvas',
  className,
  children,
}: {
  id?: string
  title: React.ReactNode
  description?: React.ReactNode
  aside?: React.ReactNode
  tone?: 'canvas' | 'surface'
  className?: string
  children?: React.ReactNode
}) {
  const headingId = id ? `${id}-title` : undefined
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn('py-16 sm:py-24', tone === 'surface' && 'border-y border-border bg-surface', className)}
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 id={headingId} className="text-[26px] font-semibold leading-tight text-foreground sm:text-[32px]">
              {title}
            </h2>
            {description && <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-[17px]">{description}</p>}
          </div>
          {aside}
        </div>
        {children && <div className="mt-10 sm:mt-12">{children}</div>}
      </div>
    </section>
  )
}

/** "Preview · Sample data" label for marketing renders of real UI with fictional numbers. */
export function SampleLabel({ preview, sample, note, className }: { preview: string; sample: string; note?: string; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground', className)}>
      <Badge variant="outline">{preview}</Badge>
      <span className="font-medium">{sample}</span>
      {note && <span className="basis-full sm:basis-auto">{note}</span>}
    </div>
  )
}

/** Bordered frame that holds a product preview (a "device" around real components). */
export function PreviewFrame({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('rounded-[22px] border border-border bg-muted p-2 sm:p-3', className)}>{children}</div>
}
