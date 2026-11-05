/**
 * SAT MASTER's own SAT-vocabulary dictionary (content/vocabulary/sat-words.json): original
 * definitions and example sentences with Uzbek and Russian translations. Pure and unit-tested.
 */
import { z } from 'zod'
import raw from '../../../content/vocabulary/sat-words.json'

const EntrySchema = z.object({ pos: z.string().max(20), uz: z.string().min(1).max(160), ru: z.string().min(1).max(160), def: z.string().min(1).max(300), ex: z.string().min(1).max(300) })
export type DictEntry = z.infer<typeof EntrySchema>
const DocSchema = z.object({ version: z.number(), words: z.record(z.string().regex(/^[a-z][a-z-]*$/), EntrySchema) })

let cache: Map<string, DictEntry> | null = null
function words(): Map<string, DictEntry> {
  cache ??= new Map(Object.entries(DocSchema.parse(raw).words))
  return cache
}
export const dictionarySize = () => words().size

/** A saved word: lowercase letters with inner hyphens, 1–40 characters (also used in card keys). */
export const WORD_RE = /^[a-z](?:[a-z-]{0,38}[a-z])?$/

/** Selected text → a word we can look up, or null if it is not one English word. */
export function normalizeWord(input: string): string | null {
  const w = input
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
    .replace(/'s$/, '')
  return WORD_RE.test(w) ? w : null
}

/** Possible base forms of an inflected word, most likely first (no external stemmer). */
export function baseForms(w: string): string[] {
  const out = [w]
  const add = (s: string) => {
    if (s.length >= 2 && !out.includes(s)) out.push(s)
  }
  const undouble = (s: string) => (/([b-df-hj-np-tv-z])\1$/.test(s) ? s.slice(0, -1) : s)
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('ing')) {
    const s = w.slice(0, -3)
    add(s)
    add(s + 'e')
    add(undouble(s))
  }
  if (w.endsWith('ed')) {
    const s = w.slice(0, -2)
    add(s)
    add(w.slice(0, -1))
    add(undouble(s))
  }
  if (w.endsWith('es')) add(w.slice(0, -2))
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1))
  if (w.endsWith('bly')) add(w.slice(0, -3) + 'ble')
  if (w.endsWith('ily')) add(w.slice(0, -3) + 'y')
  if (w.endsWith('ally')) add(w.slice(0, -2))
  if (w.endsWith('ly')) add(w.slice(0, -2))
  if (w.endsWith('ness')) add(w.slice(0, -4))
  return out
}

/** The dictionary entry for a word or one of its base forms. */
export function lookup(word: string): { key: string; entry: DictEntry } | null {
  for (const form of baseForms(word)) {
    const entry = words().get(form)
    if (entry) return { key: form, entry }
  }
  return null
}

export const getEntry = (key: string): DictEntry | null => words().get(key) ?? null

/** Every dictionary word with its entry (for drills). */
export const allEntries = (): Array<[string, DictEntry]> => [...words().entries()]
