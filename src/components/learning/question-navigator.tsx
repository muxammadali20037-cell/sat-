'use client'

import { Flag } from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavigatorItem = { index: number; answered: boolean; flagged: boolean }

/** Grid of numbered squares (the Digital SAT navigator motif). */
export function QuestionNavigator({
  items,
  current,
  onJump,
  className,
}: {
  items: NavigatorItem[]
  current: number
  onJump: (index: number) => void
  className?: string
}) {
  const answered = items.filter((i) => i.answered).length
  const flagged = items.filter((i) => i.flagged).length
  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] bg-navy-900 dark:bg-primary" aria-hidden /> Answered {answered}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-[3px] border border-dashed border-border-strong" aria-hidden /> Unanswered {items.length - answered}
        </span>
        <span className="flex items-center gap-1.5">
          <Flag className="size-3 fill-warning text-warning" aria-hidden /> For review {flagged}
        </span>
      </div>
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
        {items.map((item) => {
          const isCurrent = item.index === current
          return (
            <li key={item.index}>
              <button
                type="button"
                onClick={() => onJump(item.index)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Question ${item.index + 1}${item.answered ? ', answered' : ', unanswered'}${item.flagged ? ', marked for review' : ''}`}
                className={cn(
                  'relative flex h-10 w-full items-center justify-center rounded-md text-[13px] font-semibold tabular transition-colors',
                  item.answered
                    ? 'bg-navy-900 text-white hover:bg-navy-800 dark:bg-primary dark:text-primary-foreground'
                    : 'border border-dashed border-border-strong text-foreground hover:bg-muted',
                  isCurrent && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                )}
              >
                {item.index + 1}
                {item.flagged && <Flag className="absolute -right-1 -top-1 size-3.5 fill-warning text-warning" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
