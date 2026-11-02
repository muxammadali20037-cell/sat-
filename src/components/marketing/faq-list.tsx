import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Accessible accordion built on <details>/<summary> (works without JavaScript). */
export function FaqList({ items, className }: { items: Array<{ q: string; a: string }>; className?: string }) {
  return (
    <div className={cn('divide-y divide-border rounded-xl border border-border bg-card', className)}>
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-foreground hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180" aria-hidden />
          </summary>
          <p className="max-w-[68ch] px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
        </details>
      ))}
    </div>
  )
}
