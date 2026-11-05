import 'server-only'
import { z } from 'zod'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import type { Locale } from '@/lib/i18n/config'
import { ApiError } from '@/lib/api/errors'
import { startOfLocalDay } from '@/lib/time'
import { recordActivity } from '@/features/activity/server'
import { allDecks, cardKey, findCard, findDeck, localCard, type LocalCard } from './content'
import { cardStatus, GRADES, review, sessionQueue, type Grade } from './srs'
import { ownsWord } from '@/features/vocab/server'

/** New cards a student starts per day (across all decks), and the size of one session. */
export const NEW_CARDS_PER_DAY = 20
export const SESSION_SIZE = 30

export const ReviewSchema = z.object({
  cardKey: z.string().max(120),
  grade: z.enum(GRADES as unknown as [Grade, ...Grade[]]),
  /** Time spent on this card, for study minutes. Clamped server-side. */
  seconds: z.number().min(0).max(3600).default(0),
})
export type ReviewInput = z.infer<typeof ReviewSchema>

type StateRow = { card_key: string; ease: number; interval_days: number; reps: number; lapses: number; due_at: string; created_at: string }

async function loadStates(db: Db, userId: string): Promise<StateRow[]> {
  // RLS: the student reads only their own rows.
  const { data, error } = await db
    .from('flashcard_reviews')
    .select('card_key, ease, interval_days, reps, lapses, due_at, created_at')
    .eq('user_id', userId)
    .limit(5000)
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, ease: Number(r.ease) }))
}

export type DeckSummary = {
  id: string
  subject: 'math' | 'reading_writing'
  title: string
  description: string
  total: number
  newCount: number
  due: number
  learned: number
}

export async function loadDeckSummaries(db: Db, profile: CurrentProfile, locale: Locale): Promise<{ decks: DeckSummary[]; newLeftToday: number }> {
  const states = await loadStates(db, profile.id)
  const byKey = new Map(states.map((s) => [s.card_key, { dueAt: s.due_at, intervalDays: s.interval_days }]))
  const now = new Date()
  const decks = allDecks().map((deck) => {
    let newCount = 0
    let due = 0
    let learned = 0
    for (const card of deck.cards) {
      const status = cardStatus(byKey.get(cardKey(deck.id, card.id)) ?? null, now)
      if (status === 'new') newCount++
      else if (status === 'due') due++
      if (status === 'review') learned++
    }
    return { id: deck.id, subject: deck.subject, title: deck.title[locale], description: deck.description[locale], total: deck.cards.length, newCount, due, learned }
  })
  return { decks, newLeftToday: newLeft(states, profile.timezone) }
}

function newLeft(states: StateRow[], timeZone: string): number {
  const since = startOfLocalDay(timeZone || 'Asia/Tashkent').toISOString()
  return Math.max(0, NEW_CARDS_PER_DAY - states.filter((s) => s.created_at >= since).length)
}

export async function loadStudySession(
  db: Db,
  profile: CurrentProfile,
  deckId: string,
  locale: Locale,
): Promise<{ deck: { id: string; title: string }; cards: LocalCard[]; total: number } | null> {
  const deck = findDeck(deckId)
  if (!deck) return null
  const states = await loadStates(db, profile.id)
  const byKey = new Map(states.map((s) => [s.card_key, { dueAt: s.due_at, intervalDays: s.interval_days }]))
  const cards = deck.cards.map((c) => localCard(deck, c, locale))
  const queue = sessionQueue(cards, byKey, new Date(), { newAllowance: newLeft(states, profile.timezone), max: SESSION_SIZE })
  return { deck: { id: deck.id, title: deck.title[locale] }, cards: queue, total: deck.cards.length }
}

/** Grade one card: the next review date is computed here, never by the browser. */
export async function recordReview(admin: Db, profile: CurrentProfile, input: ReviewInput): Promise<{ dueAt: string; intervalDays: number }> {
  // Built-in deck cards, or the student's own saved words ('mine/<word>').
  if (!findCard(input.cardKey) && !(await ownsWord(admin, profile.id, input.cardKey))) throw new ApiError(404, 'NOT_FOUND', 'Card not found.')
  const { data: prev, error } = await admin
    .from('flashcard_reviews')
    .select('ease, interval_days, reps, lapses')
    .eq('user_id', profile.id)
    .eq('card_key', input.cardKey)
    .maybeSingle()
  if (error) throw error
  const now = new Date()
  const next = review(prev ? { ease: Number(prev.ease), intervalDays: prev.interval_days, reps: prev.reps, lapses: prev.lapses } : null, input.grade, now)
  const { error: upsertError } = await admin.from('flashcard_reviews').upsert(
    {
      user_id: profile.id,
      card_key: input.cardKey,
      ease: next.ease,
      interval_days: next.intervalDays,
      reps: next.reps,
      lapses: next.lapses,
      due_at: next.dueAt,
      last_reviewed_at: now.toISOString(),
      last_grade: input.grade,
    },
    { onConflict: 'user_id,card_key' },
  )
  if (upsertError) throw upsertError
  // Flashcard time counts as study time (at most 2 minutes per card).
  await recordActivity(profile.id, profile.timezone, { studySeconds: Math.min(120, input.seconds) })
  return { dueAt: next.dueAt, intervalDays: next.intervalDays }
}

/** New cards the student may still start today (shared by all decks and "My words"). */
export async function newCardsLeftToday(db: Db, profile: CurrentProfile): Promise<number> {
  return newLeft(await loadStates(db, profile.id), profile.timezone)
}
