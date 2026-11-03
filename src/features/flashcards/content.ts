/**
 * Flashcard decks: original platform content kept in the repository (content/flashcards/*.json),
 * validated here. Students' review progress lives in public.flashcard_reviews, keyed by
 * `<deck id>/<card id>`, so card ids must never be renamed once published.
 */
import { z } from 'zod'
import type { Locale } from '@/lib/i18n/config'
import mathFormulas from '../../../content/flashcards/math-formulas.json'
import rwTransitions from '../../../content/flashcards/rw-transitions.json'
import rwGrammar from '../../../content/flashcards/rw-grammar.json'
import satVocabulary from '../../../content/flashcards/sat-vocabulary.json'

const slug = z.string().regex(/^[a-z0-9-]+$/).max(50)
const text = (max: number) => z.object({ en: z.string().min(1).max(max), uz: z.string().min(1).max(max), ru: z.string().min(1).max(max) })

export const DeckSchema = z.object({
  id: slug,
  subject: z.enum(['math', 'reading_writing']),
  title: text(80),
  description: text(240),
  cards: z
    .array(z.object({ id: slug, front: text(120), back: text(320), example: z.string().max(240).optional() }))
    .min(1)
    .refine((cards) => new Set(cards.map((c) => c.id)).size === cards.length, 'Card ids must be unique'),
})
export type Deck = z.infer<typeof DeckSchema>

export const RAW_DECKS: unknown[] = [mathFormulas, rwTransitions, rwGrammar, satVocabulary]

let cached: Deck[] | null = null
export function allDecks(): Deck[] {
  cached ??= RAW_DECKS.map((d) => DeckSchema.parse(d))
  return cached
}

export function findDeck(id: string): Deck | undefined {
  return allDecks().find((d) => d.id === id)
}

export const cardKey = (deckId: string, cardId: string) => `${deckId}/${cardId}`

export function findCard(key: string): { deck: Deck; card: Deck['cards'][number] } | undefined {
  const [deckId, cardId] = key.split('/')
  const deck = deckId ? findDeck(deckId) : undefined
  const card = deck?.cards.find((c) => c.id === cardId)
  return deck && card ? { deck, card } : undefined
}

export type LocalCard = { key: string; front: string; back: string; example: string | null }

export function localCard(deck: Deck, card: Deck['cards'][number], locale: Locale): LocalCard {
  return { key: cardKey(deck.id, card.id), front: card.front[locale], back: card.back[locale], example: card.example ?? null }
}
