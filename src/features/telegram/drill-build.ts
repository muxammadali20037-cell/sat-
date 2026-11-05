/**
 * Building daily drill items (pure, unit-tested). Telegram shows plain text, so only questions that
 * read well without formatting are used: multiple choice, no image, no math notation, short.
 */
import type { DictEntry } from '@/features/vocab/dictionary'

export const DRILL_SIZE = 5
export const DRILL_WORDS = 3
export const LETTERS = ['A', 'B', 'C', 'D'] as const

export type DrillItem = { kind: 'word' | 'question'; ref: string; prompt: string; choices: string[]; correctIndex: number; explanation: string | null }
type Rng = () => number

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Markdown-ish lesson text → plain text for Telegram. */
export function plainText(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const MATHY = /\$|\\\(|\\\[|<[a-z/]|!\[/i

export type QuestionCandidate = {
  id: string
  questionType: string
  imagePath: string | null
  stem: string
  passage: string | null
  options: Array<{ content: string; isCorrect: boolean }>
}

export function suitableQuestion(q: QuestionCandidate): boolean {
  if (q.questionType !== 'multiple_choice' || q.imagePath) return false
  if (q.options.length < 2 || q.options.length > 4 || q.options.filter((o) => o.isCorrect).length !== 1) return false
  const all = [q.stem, q.passage ?? '', ...q.options.map((o) => o.content)]
  if (all.some((t) => MATHY.test(t))) return false
  return all.join('').length <= 1400 && q.options.every((o) => o.content.length <= 300)
}

/** "Which meaning?": the word's translation (or English definition) among three other words' ones. */
export function wordItem(
  word: string,
  entry: DictEntry,
  others: DictEntry[],
  locale: 'uz' | 'en' | 'ru',
  rng: Rng = Math.random,
): Omit<DrillItem, 'prompt'> & { word: string } {
  const meaning = (e: DictEntry) => (locale === 'en' ? e.def : locale === 'ru' ? e.ru : e.uz)
  const correct = meaning(entry)
  const distractors = [...new Set(others.map(meaning).filter((m) => m !== correct))].slice(0, 3)
  const choices = shuffle([correct, ...distractors], rng)
  return { kind: 'word', ref: word, word, choices, correctIndex: choices.indexOf(correct), explanation: entry.ex }
}

/** A short SAT question with its choices shuffled. */
export function questionItem(q: QuestionCandidate, explanation: string | null, rng: Rng = Math.random): Omit<DrillItem, 'prompt'> & { body: string } {
  const opts = shuffle(q.options, rng)
  const body = [q.passage ? plainText(q.passage) : '', plainText(q.stem)].filter(Boolean).join('\n\n')
  return {
    kind: 'question',
    ref: q.id,
    body,
    choices: opts.map((o) => plainText(o.content)),
    correctIndex: opts.findIndex((o) => o.isCorrect),
    explanation: explanation ? plainText(explanation).slice(0, 900) : null,
  }
}

/** Message text: prompt, then lettered choices (buttons carry only the letters). */
export function itemMessage(prompt: string, choices: string[]): string {
  return `${prompt}\n\n${choices.map((c, i) => `${LETTERS[i]}) ${c}`).join('\n')}`.slice(0, 3500)
}

/** Callback data for an answer button: 'dr:<item id>:<choice index>' (≤ 64 bytes). */
export const drillCallback = (itemId: string, choice: number) => `dr:${itemId}:${choice}`
export function parseDrillCallback(data: string | undefined): { itemId: string; choice: number } | null {
  const m = /^dr:([0-9a-f-]{36}):([0-3])$/.exec(data ?? '')
  return m ? { itemId: m[1]!, choice: Number(m[2]) } : null
}
