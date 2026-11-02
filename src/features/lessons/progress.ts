/**
 * Anti-skip lesson progress (docs/SYSTEM_ARCHITECTURE.md §7). Pure and unit-tested.
 *
 * The client reports `{ positionSeconds, event }` every ~10 s while a video plays (and on
 * play/pause/ended/visibility changes). The server credits only forward progress that its OWN
 * clock can account for:
 *
 *     credit = min(Δposition, Δwallclock × 1.25 + 2, 30)      (0 when Δposition ≤ 0)
 *
 * - Δwallclock uses the server's `last_heartbeat_at`, never a client timestamp. The first report
 *   (no `last_heartbeat_at` yet) only records the starting position.
 * - Seeking forward moves the position but earns nothing beyond the time that actually passed.
 * - Rewinds and replayed heartbeats have Δposition ≤ 0 and earn nothing.
 * - Reports arriving < 5 s after the previous accepted one earn nothing and leave the baseline
 *   untouched (the next regular heartbeat is credited for the whole interval). This stops a
 *   client from multiplying the +2 s jitter allowance with bursts; the worst-case credit rate is
 *   bounded at (5 × 1.25 + 2) / 5 = 1.65× real time.
 * - Completion when watched ≥ ratio × duration (ratio = platform setting, default 0.9).
 *
 * Text lessons (`video_provider = 'none'`) use the same mechanism: the client's position is a
 * reading-time counter that only advances while the page is visible and the student is active.
 * They complete only on an explicit `complete` event once the threshold is met.
 */

export type ProgressEvent = 'heartbeat' | 'pause' | 'ended' | 'complete'
export type LessonKind = 'video' | 'text'

export type PrevProgress = {
  lastPositionSeconds: number
  watchedSeconds: number
  lastHeartbeatAt: Date | null
  completedAt: Date | null
} | null

export type ProgressInput = { positionSeconds: number; event: ProgressEvent }

export type ProgressUpdate = {
  /** Values to persist on lesson_progress. */
  lastPositionSeconds: number
  watchedSeconds: number
  lastHeartbeatAt: Date | null
  completedAt: Date | null
  /** Seconds credited by this report (study time; not capped by the lesson length). */
  creditedSeconds: number
  /** True only on the report that first completes the lesson. */
  newlyCompleted: boolean
  thresholdSeconds: number
  /** watched ≥ threshold (enables "Mark complete" for text lessons). */
  canComplete: boolean
  /** A `complete` event arrived before the threshold was met. */
  completeRejected: boolean
  /** False when the report was too soon after the previous one and was ignored. */
  accepted: boolean
}

export const PROGRESS_RULES = {
  /** Allows up to 1.25× playback speed. */
  speedAllowance: 1.25,
  /** Network jitter allowance per report. */
  jitterSeconds: 2,
  /** No single report credits more than this. */
  maxCreditSeconds: 30,
  /** Reports closer together than this are ignored (baseline kept). */
  minIntervalSeconds: 5,
  /** Default share of the lesson that must be watched. */
  defaultCompletionRatio: 0.9,
  /** Upper bound for a text lesson's reading counter (matches lessons.duration_seconds max). */
  maxReadingCounterSeconds: 21_600,
} as const

export function normalizeCompletionRatio(ratio: unknown): number {
  const n = typeof ratio === 'string' ? Number(ratio) : ratio
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1) return PROGRESS_RULES.defaultCompletionRatio
  return n
}

/** Seconds that must be credited before the lesson can complete (at least 1). */
export function completionThreshold(durationSeconds: number, completionRatio: number): number {
  const duration = Math.max(0, Math.floor(durationSeconds))
  return Math.max(1, Math.ceil(duration * normalizeCompletionRatio(completionRatio)))
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function computeProgressUpdate(
  prev: PrevProgress,
  input: ProgressInput,
  now: Date,
  durationSeconds: number,
  completionRatio: number,
  kind: LessonKind = 'video',
): ProgressUpdate {
  const duration = Math.max(0, Math.floor(durationSeconds))
  const positionCap = kind === 'video' ? duration : PROGRESS_RULES.maxReadingCounterSeconds
  const rawPosition = Number.isFinite(input.positionSeconds) ? Math.floor(input.positionSeconds) : 0
  const position = clamp(rawPosition, 0, positionCap)

  const prevPosition = prev?.lastPositionSeconds ?? 0
  const prevWatched = prev?.watchedSeconds ?? 0
  const lastBeat = prev?.lastHeartbeatAt ?? null

  // Server wall clock only. A clock that went backwards counts as "no time passed".
  const deltaWall = lastBeat ? Math.max(0, (now.getTime() - lastBeat.getTime()) / 1000) : 0
  const tooSoon = lastBeat !== null && deltaWall < PROGRESS_RULES.minIntervalSeconds

  // Without a previous server heartbeat there is no wall-clock baseline: the first report only
  // records the starting position.
  let credit = 0
  if (lastBeat !== null && !tooSoon) {
    const deltaPosition = position - prevPosition
    if (deltaPosition > 0) {
      credit = Math.floor(
        Math.min(
          deltaPosition,
          deltaWall * PROGRESS_RULES.speedAllowance + PROGRESS_RULES.jitterSeconds,
          PROGRESS_RULES.maxCreditSeconds,
        ),
      )
    }
  }

  const watched = Math.min(duration, prevWatched + credit)
  const threshold = completionThreshold(duration, completionRatio)
  const canComplete = watched >= threshold

  let completedAt = prev?.completedAt ?? null
  let completeRejected = false
  if (!completedAt) {
    if (kind === 'video' && canComplete) {
      completedAt = now
    } else if (input.event === 'complete') {
      if (canComplete) completedAt = now
      else completeRejected = true
    }
  }

  return {
    lastPositionSeconds: tooSoon ? prevPosition : position,
    watchedSeconds: watched,
    lastHeartbeatAt: tooSoon ? lastBeat : now,
    completedAt,
    creditedSeconds: credit,
    newlyCompleted: !prev?.completedAt && completedAt !== null,
    thresholdSeconds: threshold,
    canComplete,
    completeRejected,
    accepted: !tooSoon,
  }
}
