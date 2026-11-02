import { cn } from '@/lib/utils'
import { SCORE_MAX, SCORE_MIN, scorePosition } from '@/features/onboarding/schemas'

const TICKS = [400, 600, 800, 1000, 1200, 1400, 1600]

/**
 * The 400–1600 SAT scale as a visual motif, with the chosen score marked. Decorative: the
 * accessible control is the slider/number input next to it, so this is aria-hidden by default.
 */
export function ScoreScale({ score, className }: { score: number | null; className?: string }) {
  const valid = score !== null && Number.isFinite(score) && score >= SCORE_MIN && score <= SCORE_MAX
  const position = valid ? scorePosition(score) : null
  return (
    <div aria-hidden className={cn('select-none', className)}>
      <div className="relative h-14">
        {position !== null && (
          <>
            {/* Label slides from left-aligned (400) to right-aligned (1600) so it never overflows. */}
            <span
              className="absolute bottom-6 rounded-md bg-navy-900 px-2 py-0.5 text-[13px] font-semibold text-white tabular dark:bg-primary dark:text-primary-foreground"
              style={{ left: `${position * 100}%`, transform: `translateX(-${position * 100}%)` }}
            >
              {score}
            </span>
            <span
              className="absolute bottom-3 h-3 w-px -translate-x-1/2 bg-navy-900 dark:bg-primary"
              style={{ left: `${position * 100}%` }}
            />
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 h-3 overflow-hidden rounded-full bg-muted">
          {position !== null && <div className="h-full bg-primary/80" style={{ width: `${position * 100}%` }} />}
        </div>
      </div>
      <div className="relative mt-1.5 h-4 text-[11px] text-muted-foreground tabular">
        {TICKS.map((tick) => {
          const left = ((tick - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100
          return (
            <span
              key={tick}
              className={cn(
                'absolute',
                tick === SCORE_MIN ? 'left-0' : tick === SCORE_MAX ? 'right-0' : '-translate-x-1/2',
                tick !== SCORE_MIN && tick !== SCORE_MAX && tick % 400 !== 0 && 'hidden sm:inline',
              )}
              style={tick === SCORE_MIN || tick === SCORE_MAX ? undefined : { left: `${left}%` }}
            >
              {tick}
            </span>
          )
        })}
      </div>
    </div>
  )
}
