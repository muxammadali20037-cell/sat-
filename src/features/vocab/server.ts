import 'server-only'
import { z } from 'zod'
import type { Db } from '@/lib/supabase/server'
import type { CurrentProfile } from '@/lib/auth/session'
import type { Locale } from '@/lib/i18n/config'
import { ApiError } from '@/lib/api/errors'
import type { LocalCard } from '@/features/flashcards/content'
import { cardStatus, sessionQueue } from '@/features/flashcards/srs'
import { getEntry, lookup, normalizeWord, WORD_RE, type DictEntry } from './dictionary'

/** The most words one student keeps; enough for SAT prep, small enough to stay fast. */
export const MAX_WORDS = 2000
export const MINE_DECK = 'mine'
export const mineKey = (word: string) => `${MINE_DECK}/${word}`
export const VOCAB_SOURCES = ['practice', 'review', 'lesson', 'guide', 'manual'] as const

const clean = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, ' ').trim().slice(0, max))
    .optional()

export const SaveWordSchema = z.object({
  word: z.string().min(1).max(60),
  context: clean(400),
  source: z.enum(VOCAB_SOURCES).default('manual'),
  sourceRef: z.string().max(200).optional(),
  translation: clean(200),
})
export const UpdateWordSchema = z.object({ word: z.string().regex(WORD_RE), translation: clean(200) })
export const WordQuerySchema = z.object({ word: z.string().min(1).max(60) })

export type WordInfo = {
  word: string
  display: string
  found: boolean
  pos: string | null
  translation: string | null
  definition: string | null
  example: string | null
  saved: boolean
}

/** Translation shown in the student's language: Uzbek/Russian from the dictionary; English UI shows Uzbek. */
const translationFor = (e: DictEntry, locale: Locale) => (locale === 'ru' ? e.ru : e.uz)

export async function lookupWord(db: Db, userId: string, raw: string, locale: Locale): Promise<WordInfo> {
  const normalized = normalizeWord(raw)
  if (!normalized) throw new ApiError(400, 'VALIDATION_FAILED', 'Select one English word.')
  const hit = lookup(normalized)
  const word = hit?.key ?? normalized
  const { data, error } = await db.from('vocab_words').select('translation').eq('user_id', userId).eq('word', word).maybeSingle()
  if (error) throw error
  return {
    word,
    display: raw.trim().slice(0, 60),
    found: Boolean(hit),
    pos: hit?.entry.pos ?? null,
    translation: hit ? translationFor(hit.entry, locale) : (data?.translation ?? null),
    definition: hit?.entry.def ?? null,
    example: hit?.entry.ex ?? null,
    saved: Boolean(data),
  }
}

/** Saves (or keeps) a word for the signed-in student. Idempotent per word. */
export async function saveWord(admin: Db, profile: CurrentProfile, input: z.infer<typeof SaveWordSchema>): Promise<{ word: string; created: boolean }> {
  const normalized = normalizeWord(input.word)
  if (!normalized) throw new ApiError(400, 'VALIDATION_FAILED', 'Select one English word.')
  const hit = lookup(normalized)
  const word = hit?.key ?? normalized
  const existing = await admin.from('vocab_words').select('id').eq('user_id', profile.id).eq('word', word).maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) {
    if (input.translation) await admin.from('vocab_words').update({ translation: input.translation, updated_at: new Date().toISOString() }).eq('id', existing.data.id)
    return { word, created: false }
  }
  const { count, error: countError } = await admin.from('vocab_words').select('id', { count: 'exact', head: true }).eq('user_id', profile.id)
  if (countError) throw countError
  if ((count ?? 0) >= MAX_WORDS) throw new ApiError(409, 'CONFLICT', `You can keep up to ${MAX_WORDS} words. Remove some you already know.`)
  const { error } = await admin.from('vocab_words').upsert(
    {
      user_id: profile.id,
      word,
      display: hit ? word : input.word.trim().slice(0, 60),
      in_dictionary: Boolean(hit),
      translation: input.translation || null,
      context: input.context || null,
      source: input.source,
      source_ref: input.sourceRef ?? null,
    },
    { onConflict: 'user_id,word', ignoreDuplicates: true },
  )
  if (error) throw error
  return { word, created: true }
}

export async function updateWordTranslation(admin: Db, profile: CurrentProfile, input: z.infer<typeof UpdateWordSchema>) {
  const { data, error } = await admin
    .from('vocab_words')
    .update({ translation: input.translation || null, updated_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .eq('word', input.word)
    .select('id')
  if (error) throw error
  if (!data?.length) throw new ApiError(404, 'NOT_FOUND', 'Word not found.')
  return { ok: true }
}

/** Removes the word and its review history. */
export async function deleteWord(admin: Db, profile: CurrentProfile, word: string) {
  if (!WORD_RE.test(word)) throw new ApiError(400, 'VALIDATION_FAILED', 'Invalid word.')
  const { error } = await admin.from('vocab_words').delete().eq('user_id', profile.id).eq('word', word)
  if (error) throw error
  const { error: reviewError } = await admin.from('flashcard_reviews').delete().eq('user_id', profile.id).eq('card_key', mineKey(word))
  if (reviewError) throw reviewError
  return { ok: true }
}

export async function ownsWord(admin: Db, userId: string, key: string): Promise<boolean> {
  const [deck, word] = key.split('/')
  if (deck !== MINE_DECK || !word || !WORD_RE.test(word)) return false
  const { data, error } = await admin.from('vocab_words').select('id').eq('user_id', userId).eq('word', word).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export type MyWord = {
  word: string
  display: string
  pos: string | null
  translation: string | null
  ownTranslation: string | null
  definition: string | null
  example: string | null
  context: string | null
  source: string
  createdAt: string
  status: 'new' | 'due' | 'learning' | 'review'
}

type Row = { word: string; display: string; in_dictionary: boolean; translation: string | null; context: string | null; source: string; created_at: string }

function toWord(r: Row, locale: Locale, state: { dueAt: string; intervalDays: number } | null, now: Date): MyWord {
  const e = r.in_dictionary ? getEntry(r.word) : null
  return {
    word: r.word,
    display: r.display,
    pos: e?.pos ?? null,
    translation: r.translation || (e ? translationFor(e, locale) : null),
    ownTranslation: r.translation,
    definition: e?.def ?? null,
    example: e?.ex ?? null,
    context: r.context,
    source: r.source,
    createdAt: r.created_at,
    status: cardStatus(state, now),
  }
}

async function load(db: Db, userId: string) {
  const [words, reviews] = await Promise.all([
    db.from('vocab_words').select('word, display, in_dictionary, translation, context, source, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(MAX_WORDS),
    db.from('flashcard_reviews').select('card_key, due_at, interval_days').eq('user_id', userId).like('card_key', `${MINE_DECK}/%`).limit(MAX_WORDS),
  ])
  if (words.error) throw words.error
  if (reviews.error) throw reviews.error
  const states = new Map((reviews.data ?? []).map((r) => [r.card_key, { dueAt: r.due_at, intervalDays: r.interval_days }]))
  return { rows: (words.data ?? []) as Row[], states }
}

export async function loadMyWords(db: Db, profile: CurrentProfile, locale: Locale): Promise<{ words: MyWord[]; due: number; newCount: number; learned: number }> {
  const { rows, states } = await load(db, profile.id)
  const now = new Date()
  const words = rows.map((r) => toWord(r, locale, states.get(mineKey(r.word)) ?? null, now))
  return {
    words,
    due: words.filter((w) => w.status === 'due').length,
    newCount: words.filter((w) => w.status === 'new').length,
    learned: words.filter((w) => w.status === 'review').length,
  }
}

/** Flashcards for "My words": the word on the front; translation, meaning and the sentence it came from on the back. */
export async function myWordsSession(db: Db, profile: CurrentProfile, locale: Locale, opts: { newAllowance: number; max: number }): Promise<{ cards: LocalCard[]; total: number }> {
  const { rows, states } = await load(db, profile.id)
  const now = new Date()
  const cards: LocalCard[] = rows
    .slice()
    .reverse()
    .map((r) => {
      const w = toWord(r, locale, null, now)
      const back = [w.translation, w.definition].filter(Boolean).join(' — ') || '—'
      return { key: mineKey(r.word), front: w.pos ? `${w.display} (${w.pos})` : w.display, back, example: w.context || w.example }
    })
  return { cards: sessionQueue(cards, states, now, opts), total: rows.length }
}
