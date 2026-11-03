/**
 * Spaced repetition for flashcards (pure, unit-tested). A simplified SM-2, close to what
 * Anki-style tools do:
 *   again → relearn in 10 minutes, ease −0.20, counts as a lapse
 *   hard  → first time 1 day, then interval × 1.2, ease −0.15
 *   good  → 1 day, then 3 days, then interval × ease
 *   easy  → 3 days, then 6 days, then interval × ease × 1.3, ease +0.15
 * Ease stays within 1.3–3.0 and intervals are capped at 10 years.
 */

export type Grade = 'again' | 'hard' | 'good' | 'easy'
export const GRADES: readonly Grade[] = ['again', 'hard', 'good', 'easy']

export type ReviewState = { ease: number; intervalDays: number; reps: number; lapses: number; dueAt: string }

export const NEW_CARD: Omit<ReviewState, 'dueAt'> = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 }
export const RELEARN_MINUTES = 10
export const MAX_INTERVAL_DAYS = 3650

const clampEase = (e: number) => Math.round(Math.min(3, Math.max(1.3, e)) * 100) / 100
const clampDays = (d: number) => Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(d)))

export function review(prev: Omit<ReviewState, 'dueAt'> | null, grade: Grade, now: Date): ReviewState {
  const p = prev ?? NEW_CARD
  if (grade === 'again') {
    return {
      ease: clampEase(p.ease - 0.2),
      intervalDays: 0,
      reps: 0,
      lapses: prev ? p.lapses + 1 : 0,
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * 60_000).toISOString(),
    }
  }
  let days: number
  let ease = p.ease
  if (grade === 'hard') {
    days = p.reps === 0 ? 1 : clampDays(Math.max(1, p.intervalDays) * 1.2)
    ease -= 0.15
  } else if (grade === 'good') {
    days = p.reps === 0 ? 1 : p.reps === 1 ? 3 : clampDays(p.intervalDays * p.ease)
  } else {
    days = p.reps === 0 ? 3 : p.reps === 1 ? 6 : clampDays(p.intervalDays * p.ease * 1.3)
    ease += 0.15
  }
  days = clampDays(days)
  return { ease: clampEase(ease), intervalDays: days, reps: p.reps + 1, lapses: p.lapses, dueAt: new Date(now.getTime() + days * 86_400_000).toISOString() }
}

export type CardStatus = 'new' | 'due' | 'learning' | 'review'

/** new: never reviewed; due: review time has come; learning: short relearn step; review: scheduled later. */
export function cardStatus(state: { dueAt: string; intervalDays: number } | null, now: Date): CardStatus {
  if (!state) return 'new'
  if (new Date(state.dueAt).getTime() <= now.getTime()) return 'due'
  return state.intervalDays === 0 ? 'learning' : 'review'
}

/** Cards a session shows: everything due (oldest first), then new cards up to the daily allowance. */
export function sessionQueue<C extends { key: string }>(
  cards: C[],
  states: Map<string, { dueAt: string; intervalDays: number }>,
  now: Date,
  opts: { newAllowance: number; max: number },
): C[] {
  const due = cards
    .filter((c) => cardStatus(states.get(c.key) ?? null, now) === 'due')
    .sort((a, b) => states.get(a.key)!.dueAt.localeCompare(states.get(b.key)!.dueAt))
  const fresh = cards.filter((c) => !states.has(c.key)).slice(0, Math.max(0, opts.newAllowance))
  return [...due, ...fresh].slice(0, opts.max)
}
