import { describe, expect, it } from 'vitest'
import {
  historyFromAnswers,
  mixedQuotas,
  orderByTier,
  retryQuestionIds,
  selectPracticeQuestions,
  shuffle,
  type Candidate,
} from '@/features/practice/select'

/** Deterministic PRNG (mulberry32) so ordering assertions are reproducible. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const make = (prefix: string, n: number, difficulty: Candidate['difficulty']): Candidate[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, difficulty }))

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    const out = shuffle(input, seeded(1))
    expect(out.slice().sort()).toEqual(input)
    expect(input).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('orderByTier', () => {
  it('puts never-seen first, then previously incorrect, then previously correct', () => {
    const items = [{ id: 'correct1' }, { id: 'new1' }, { id: 'wrong1' }, { id: 'new2' }, { id: 'correct2' }, { id: 'wrong2' }]
    const history = new Map([
      ['correct1', true],
      ['correct2', true],
      ['wrong1', false],
      ['wrong2', false],
    ])
    for (let seed = 1; seed < 20; seed++) {
      const ids = orderByTier(items, history, seeded(seed)).map((i) => i.id)
      expect(new Set(ids.slice(0, 2))).toEqual(new Set(['new1', 'new2']))
      expect(new Set(ids.slice(2, 4))).toEqual(new Set(['wrong1', 'wrong2']))
      expect(new Set(ids.slice(4))).toEqual(new Set(['correct1', 'correct2']))
    }
  })

  it('randomizes within a tier', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: `q${i}` }))
    const orders = new Set(Array.from({ length: 10 }, (_, s) => orderByTier(items, new Map(), seeded(s + 1)).map((i) => i.id).join()))
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('selectPracticeQuestions', () => {
  it('returns at most `count` unique ids of the requested difficulty', () => {
    const candidates = [...make('e', 5, 'easy'), ...make('m', 5, 'medium'), ...make('h', 5, 'hard')]
    const ids = selectPracticeQuestions({ candidates, history: new Map(), count: 4, difficulty: 'hard', rng: seeded(3) })
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids.every((id) => id.startsWith('h'))).toBe(true)
  })

  it('prefers unseen questions, then previously incorrect ones', () => {
    const candidates = make('q', 6, 'medium')
    const history = new Map([
      ['q0', true],
      ['q1', true],
      ['q2', false],
      ['q3', true],
    ])
    const ids = selectPracticeQuestions({ candidates, history, count: 3, difficulty: 'medium', rng: seeded(5) })
    expect(new Set(ids.slice(0, 2))).toEqual(new Set(['q4', 'q5']))
    expect(ids[2]).toBe('q2')
  })

  it('spreads a mixed session across difficulties, interleaved', () => {
    const candidates = [...make('e', 10, 'easy'), ...make('m', 10, 'medium'), ...make('h', 10, 'hard')]
    const ids = selectPracticeQuestions({ candidates, history: new Map(), count: 9, difficulty: 'mixed', rng: seeded(7) })
    const prefixes = ids.map((id) => id[0])
    expect(prefixes.filter((p) => p === 'e')).toHaveLength(3)
    expect(prefixes.filter((p) => p === 'm')).toHaveLength(3)
    expect(prefixes.filter((p) => p === 'h')).toHaveLength(3)
    expect(prefixes.slice(0, 3)).toEqual(['e', 'm', 'h'])
  })

  it('fills from other difficulties when one runs short in mixed mode', () => {
    const candidates = [...make('e', 1, 'easy'), ...make('m', 10, 'medium'), ...make('h', 10, 'hard')]
    const ids = selectPracticeQuestions({ candidates, history: new Map(), count: 9, difficulty: 'mixed', rng: seeded(9) })
    expect(ids).toHaveLength(9)
    expect(ids.filter((id) => id.startsWith('e'))).toHaveLength(1)
    expect(ids.filter((id) => id.startsWith('m'))).toHaveLength(4)
    expect(ids.filter((id) => id.startsWith('h'))).toHaveLength(4)
  })

  it('returns fewer when the pool is small, and never excluded or duplicate ids', () => {
    const candidates = [...make('q', 3, 'easy'), { id: 'q0', difficulty: 'easy' as const }]
    const ids = selectPracticeQuestions({ candidates, history: new Map(), count: 10, difficulty: 'easy', exclude: new Set(['q1']), rng: seeded(2) })
    expect(ids.slice().sort()).toEqual(['q0', 'q2'])
  })

  it('returns nothing for a non-positive count or empty pool', () => {
    expect(selectPracticeQuestions({ candidates: make('q', 3, 'easy'), history: new Map(), count: 0, difficulty: 'easy' })).toEqual([])
    expect(selectPracticeQuestions({ candidates: [], history: new Map(), count: 5, difficulty: 'mixed' })).toEqual([])
  })
})

describe('mixedQuotas', () => {
  it('splits evenly with remainder going easy → medium → hard', () => {
    expect(mixedQuotas({ easy: 10, medium: 10, hard: 10 }, 10)).toEqual({ easy: 4, medium: 3, hard: 3 })
  })
  it('never exceeds availability', () => {
    expect(mixedQuotas({ easy: 0, medium: 2, hard: 1 }, 10)).toEqual({ easy: 0, medium: 2, hard: 1 })
  })
})

describe('retryQuestionIds', () => {
  it('keeps incorrect and unanswered questions in original order', () => {
    const questions = [
      { questionId: 'c', position: 3 },
      { questionId: 'a', position: 1 },
      { questionId: 'b', position: 2 },
      { questionId: 'd', position: 4 },
    ]
    const answers = new Map<string, boolean | null>([
      ['a', true],
      ['b', false],
      ['c', null],
    ])
    expect(retryQuestionIds(questions, answers)).toEqual(['b', 'c', 'd'])
  })
  it('is empty when everything was correct', () => {
    expect(retryQuestionIds([{ questionId: 'a', position: 1 }], new Map([['a', true]]))).toEqual([])
  })
})

describe('historyFromAnswers', () => {
  it('uses the most recent scored answer per question', () => {
    const history = historyFromAnswers([
      { questionId: 'a', isCorrect: true },
      { questionId: 'a', isCorrect: false },
      { questionId: 'b', isCorrect: null },
      { questionId: 'b', isCorrect: false },
    ])
    expect(history.get('a')).toBe(true)
    expect(history.get('b')).toBe(false)
  })
})
