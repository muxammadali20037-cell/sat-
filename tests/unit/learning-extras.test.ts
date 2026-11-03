/**
 * PHASE 2 learning extras: mistake notebook rules, flashcard scheduling and content, achievements,
 * country rules, timed drills, and Russian plurals / dictionary merging.
 */
import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { mistakePracticeOrder, splitMistakes, type ScoredAnswer } from '@/features/mistakes/notebook'
import { cardStatus, review, sessionQueue } from '@/features/flashcards/srs'
import { allDecks, cardKey, DeckSchema, findCard, RAW_DECKS } from '@/features/flashcards/content'
import { achievements, longestStreak } from '@/features/dashboard/achievements'
import { countryRules, guessCountry, providersForCountry, COUNTRY_CODES } from '@/config/countries'
import { drillSeconds } from '@/features/practice/schemas'
import { isPastDeadline } from '@/features/practice/timing'
import { defineDict, plural, resolveDict } from '@/lib/i18n/dict'
import { collectMath, parseRichText } from '@/lib/rich-text/tokenize'

const ans = (q: string, ok: boolean, at: string, attempt = 'a1', kind = 'practice'): ScoredAnswer => ({
  question_id: q,
  attempt_id: attempt,
  is_correct: ok,
  answered_at: at,
  kind,
})

describe('mistake notebook', () => {
  const rows = [
    ans('q1', false, '2026-11-01T10:00:00Z'),
    ans('q1', true, '2026-11-02T10:00:00Z', 'a2'), // fixed
    ans('q2', true, '2026-11-01T10:00:00Z'),
    ans('q2', false, '2026-11-03T10:00:00Z', 'a3', 'mock_exam'), // open (latest wrong)
    ans('q3', false, '2026-11-01T09:00:00Z'),
    ans('q3', false, '2026-11-02T09:00:00Z', 'a2'), // open, missed twice
    ans('q4', true, '2026-11-01T09:00:00Z'), // never wrong
    ans('q5', false, '2026-11-02T08:00:00Z'), // open but locked by a running test
  ]
  it('splits open and fixed mistakes by the latest answer, hiding locked questions', () => {
    const { open, fixed } = splitMistakes(rows, new Set(['q5']))
    expect(open.map((m) => m.questionId)).toEqual(['q2', 'q3'])
    expect(fixed.map((m) => m.questionId)).toEqual(['q1'])
    expect(open[0]).toMatchObject({ timesWrong: 1, lastWrongAttemptId: 'a3', lastWrongKind: 'mock_exam' })
    expect(open[1]).toMatchObject({ timesWrong: 2, firstWrongAt: '2026-11-01T09:00:00Z', lastWrongAttemptId: 'a2' })
  })
  it('practises the most-missed first, then the oldest', () => {
    expect(mistakePracticeOrder(splitMistakes(rows).open)).toEqual(['q3', 'q5', 'q2'])
  })
})

describe('flashcard scheduling (simplified SM-2)', () => {
  const now = new Date('2026-11-03T12:00:00Z')
  it('schedules new cards by grade', () => {
    expect(review(null, 'good', now)).toMatchObject({ intervalDays: 1, reps: 1, ease: 2.5, dueAt: '2026-11-04T12:00:00.000Z' })
    expect(review(null, 'easy', now)).toMatchObject({ intervalDays: 3, ease: 2.65 })
    expect(review(null, 'hard', now)).toMatchObject({ intervalDays: 1, ease: 2.35 })
    const again = review(null, 'again', now)
    expect(again).toMatchObject({ intervalDays: 0, reps: 0, lapses: 0 })
    expect(again.dueAt).toBe('2026-11-03T12:10:00.000Z')
  })
  it('grows intervals with ease and resets on a lapse', () => {
    const one = review(null, 'good', now)
    const two = review(one, 'good', now)
    expect(two.intervalDays).toBe(3)
    const three = review(two, 'good', now)
    expect(three.intervalDays).toBe(8) // 3 × 2.5 = 7.5 → 8
    const lapse = review(three, 'again', now)
    expect(lapse).toMatchObject({ intervalDays: 0, reps: 0, lapses: 1, ease: 2.3 })
  })
  it('keeps ease within 1.3–3.0', () => {
    let s = review(null, 'again', now)
    for (let i = 0; i < 20; i++) s = review(s, 'again', now)
    expect(s.ease).toBe(1.3)
    let e = review(null, 'easy', now)
    for (let i = 0; i < 20; i++) e = review(e, 'easy', now)
    expect(e.ease).toBe(3)
    expect(e.intervalDays).toBeLessThanOrEqual(3650)
  })
  it('builds a session: due first (oldest first), then new cards within the allowance', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'].map((key) => ({ key }))
    const states = new Map([
      ['b', { dueAt: '2026-11-03T11:00:00Z', intervalDays: 3 }],
      ['c', { dueAt: '2026-11-02T11:00:00Z', intervalDays: 1 }],
      ['d', { dueAt: '2026-11-09T11:00:00Z', intervalDays: 6 }],
    ])
    expect(sessionQueue(cards, states, now, { newAllowance: 1, max: 10 }).map((c) => c.key)).toEqual(['c', 'b', 'a'])
    expect(sessionQueue(cards, states, now, { newAllowance: 0, max: 1 }).map((c) => c.key)).toEqual(['c'])
    expect(cardStatus(states.get('d')!, now)).toBe('review')
    expect(cardStatus({ dueAt: '2026-11-03T12:05:00Z', intervalDays: 0 }, now)).toBe('learning')
    expect(cardStatus(null, now)).toBe('new')
  })
})

describe('flashcard content', () => {
  it('every deck is valid, ids are unique and stable keys resolve', () => {
    for (const raw of RAW_DECKS) expect(() => DeckSchema.parse(raw)).not.toThrow()
    const decks = allDecks()
    expect(new Set(decks.map((d) => d.id)).size).toBe(decks.length)
    for (const d of decks) for (const c of d.cards) expect(findCard(cardKey(d.id, c.id))?.card.id).toBe(c.id)
    expect(findCard('missing/card')).toBeUndefined()
    expect(decks.reduce((n, d) => n + d.cards.length, 0)).toBeGreaterThanOrEqual(100)
  })
  it('all math renders with KaTeX in every language', () => {
    for (const d of allDecks()) {
      for (const c of d.cards) {
        for (const text of [...Object.values(c.front), ...Object.values(c.back)]) {
          for (const tex of collectMath(parseRichText(text))) {
            expect(() => katex.renderToString(tex, { throwOnError: true }), `${d.id}/${c.id}: ${tex}`).not.toThrow()
          }
        }
      }
    }
  })
})

describe('achievements', () => {
  it('are earned only from real counts', () => {
    const list = achievements({ diagnosticsCompleted: 1, scoredAnswers: 120, longestStreak: 6, mocksCompleted: 0, lessonsCompleted: 10, advancedDomains: 0 })
    const byId = Object.fromEntries(list.map((a) => [a.id, a]))
    expect(byId.first_diagnostic!.earned).toBe(true)
    expect(byId.questions_100!.earned).toBe(true)
    expect(byId.questions_500).toMatchObject({ earned: false, value: 120, target: 500 })
    expect(byId.streak_7).toMatchObject({ earned: false, value: 6 })
    expect(byId.lessons_10!.earned).toBe(true)
    expect(byId.first_mock!.earned).toBe(false)
  })
  it('finds the longest run of active days', () => {
    const day = (d: string, q = 1) => ({ activity_date: d, study_seconds: 0, questions_answered: q, lessons_completed: 0 })
    expect(longestStreak([day('2026-10-01'), day('2026-10-02'), day('2026-10-03'), day('2026-10-05'), day('2026-10-06'), day('2026-10-04', 0)])).toBe(3)
    expect(longestStreak([])).toBe(0)
  })
})

describe('country rules', () => {
  const providers = (['click', 'payme', 'stripe', 'test'] as const).map((id) => ({ id }))
  it('Uzbekistan pays in UZS with Click and Payme', () => {
    expect(countryRules('UZ')!.currency).toBe('UZS')
    expect(providersForCountry('UZ', providers).map((p) => p.id)).toEqual(['click', 'payme', 'test'])
  })
  it('other countries pay in USD by card; unsupported countries get no real method', () => {
    expect(providersForCountry('KZ', providers).map((p) => p.id)).toEqual(['stripe', 'test'])
    expect(providersForCountry('ZZ', providers).map((p) => p.id)).toEqual(['stripe', 'test'])
    expect(providersForCountry('RU', providers).map((p) => p.id)).toEqual(['test'])
  })
  it('an unset country keeps every configured method', () => {
    expect(providersForCountry(null, providers)).toHaveLength(4)
  })
  it('guesses Uzbekistan from its time zones only', () => {
    expect(guessCountry('Asia/Tashkent')).toBe('UZ')
    expect(guessCountry('Asia/Samarkand')).toBe('UZ')
    expect(guessCountry('Europe/London')).toBeNull()
    for (const c of COUNTRY_CODES) expect(c).toMatch(/^[A-Z]{2}$/)
  })
})

describe('timed drills', () => {
  it('give Digital SAT pace per question', () => {
    expect(drillSeconds('reading_writing', 10)).toBe(710)
    expect(drillSeconds('math', 10)).toBe(950)
  })
  it('stop accepting answers after the deadline plus a short grace', () => {
    const deadline = '2026-11-03T12:00:00Z'
    const t = new Date(deadline).getTime()
    expect(isPastDeadline({ deadline_at: null }, t + 10_000_000)).toBe(false)
    expect(isPastDeadline({ deadline_at: deadline }, t + 4_000)).toBe(false)
    expect(isPastDeadline({ deadline_at: deadline }, t + 6_000)).toBe(true)
  })
})

describe('Russian copy', () => {
  it('uses CLDR plural categories', () => {
    const f = { one: '{n} вопрос', few: '{n} вопроса', many: '{n} вопросов', other: '{n} вопроса' }
    expect([1, 2, 5, 11, 21, 22, 25, 0].map((n) => plural(n, f))).toEqual([
      '1 вопрос',
      '2 вопроса',
      '5 вопросов',
      '11 вопросов',
      '21 вопрос',
      '22 вопроса',
      '25 вопросов',
      '0 вопросов',
    ])
    expect(plural(1, { one: '{n} card', other: '{n} cards' })).toBe('1 card')
    expect(plural(3, { one: '{n} card', other: '{n} cards' })).toBe('3 cards')
  })
  it('keeps translated lists as lists and falls back to English for missing keys', () => {
    const d = defineDict({
      en: { items: ['a', 'b'], title: 'Title', nested: { x: 'x', y: 'y' } },
      uz: { items: ['c', 'd'], title: 'Sarlavha', nested: { x: 'x', y: 'y' } },
      // A partial copy can still reach runtime (e.g. data loaded from elsewhere): English fills the gaps.
      ru: { items: ['е', 'ж', 'з'], nested: { x: 'икс' } } as never,
    })
    const ru = resolveDict(d, 'ru')
    expect(Array.isArray(ru.items)).toBe(true)
    expect(ru.items).toEqual(['е', 'ж', 'з'])
    expect(ru.title).toBe('Title')
    expect(ru.nested).toEqual({ x: 'икс', y: 'y' })
  })
})
