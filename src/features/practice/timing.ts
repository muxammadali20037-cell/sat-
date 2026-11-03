import { DRILL_GRACE_SECONDS } from './schemas'

/**
 * Client-reported timing is never trusted as-is. Pure helpers (unit-tested).
 */

/** Longest time credited to a single practice question (15 minutes). */
export const MAX_SECONDS_PER_QUESTION = 900

/**
 * Clamp a client-reported time to [0, min(maxSeconds, elapsedSinceStart)], rounded to whole
 * seconds. Non-finite input counts as 0. `elapsedSinceStart` is measured by the server from the
 * attempt's `started_at`, so a client cannot claim more time than has actually passed.
 */
export function clampTimeSpent(
  reported: number | null | undefined,
  opts: { maxSeconds?: number; elapsedSinceStartSeconds?: number } = {},
): number {
  const max = Math.max(0, Math.min(opts.maxSeconds ?? MAX_SECONDS_PER_QUESTION, opts.elapsedSinceStartSeconds ?? Number.POSITIVE_INFINITY))
  if (typeof reported !== 'number' || !Number.isFinite(reported) || reported <= 0) return 0
  return Math.min(Math.round(reported), Math.floor(max))
}

/** Seconds between two instants (never negative). */
export function secondsBetween(from: string | Date, to: Date = new Date()): number {
  const start = typeof from === 'string' ? new Date(from).getTime() : from.getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(0, Math.floor((to.getTime() - start) / 1000))
}

/** A timed drill is over once its server deadline (plus a short grace for network delay) has passed. */
export function isPastDeadline(attempt: { deadline_at: string | null }, now = Date.now(), graceSeconds = DRILL_GRACE_SECONDS): boolean {
  return !!attempt.deadline_at && now > new Date(attempt.deadline_at).getTime() + graceSeconds * 1000
}
