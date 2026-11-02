import { describe, expect, it } from 'vitest'
import { countersFromAnswers, domainBreakdown, skillBreakdown, summarize, weakestSkills, type ScoredItem } from '@/features/results/aggregate'

const item = (over: Partial<ScoredItem> & Pick<ScoredItem, 'questionId'>): ScoredItem => ({
  skillId: 's1',
  skillName: 'Linear functions',
  domainId: 'd1',
  domainName: 'Algebra',
  order: 10101,
  answered: true,
  isCorrect: true,
  timeSpentSeconds: 30,
  ...over,
})

const items: ScoredItem[] = [
  item({ questionId: 'q1', isCorrect: true }),
  item({ questionId: 'q2', isCorrect: false }),
  item({ questionId: 'q3', answered: false, isCorrect: null, timeSpentSeconds: 0 }),
  item({ questionId: 'q4', skillId: 's2', skillName: 'Circles', domainId: 'd2', domainName: 'Geometry', order: 10401, isCorrect: false }),
  item({ questionId: 'q5', skillId: 's2', skillName: 'Circles', domainId: 'd2', domainName: 'Geometry', order: 10401, isCorrect: true }),
]

describe('summarize', () => {
  it('practice accuracy counts answered questions only', () => {
    expect(summarize(items, 'answered')).toEqual({ total: 5, answered: 4, correct: 2, incorrect: 2, unanswered: 1, accuracy: 0.5, timeSpentSeconds: 120 })
  })
  it('diagnostic accuracy counts every assigned question', () => {
    expect(summarize(items, 'assigned').accuracy).toBeCloseTo(2 / 5)
  })
  it('has null accuracy with nothing to count', () => {
    expect(summarize([], 'answered').accuracy).toBeNull()
  })
})

describe('skillBreakdown / domainBreakdown', () => {
  it('groups by skill in taxonomy order', () => {
    const skills = skillBreakdown(items, 'answered')
    expect(skills.map((s) => [s.skillId, s.correct, s.total])).toEqual([
      ['s1', 1, 2],
      ['s2', 1, 2],
    ])
    expect(skillBreakdown(items, 'assigned')[0]).toMatchObject({ skillId: 's1', total: 3, correct: 1 })
  })
  it('adds level bands per domain', () => {
    const domains = domainBreakdown(items, 'assigned')
    expect(domains.map((d) => [d.domainId, d.accuracy, d.level])).toEqual([
      ['d1', 1 / 3, 'foundation'],
      ['d2', 0.5, 'developing'],
    ])
  })
})

describe('weakestSkills', () => {
  it('orders by accuracy, then domain weight, and skips perfect skills', () => {
    const stats = [
      { skillId: 'a', skillName: 'A', domainId: 'light', domainName: '', order: 1, total: 2, answered: 2, correct: 1, accuracy: 0.5 },
      { skillId: 'b', skillName: 'B', domainId: 'heavy', domainName: '', order: 2, total: 2, answered: 2, correct: 1, accuracy: 0.5 },
      { skillId: 'c', skillName: 'C', domainId: 'light', domainName: '', order: 3, total: 3, answered: 3, correct: 0, accuracy: 0 },
      { skillId: 'd', skillName: 'D', domainId: 'heavy', domainName: '', order: 4, total: 1, answered: 1, correct: 1, accuracy: 1 },
    ]
    const weights = new Map([
      ['heavy', 35],
      ['light', 15],
    ])
    expect(weakestSkills(stats, weights, 3).map((s) => s.skillId)).toEqual(['c', 'b', 'a'])
  })
})

describe('countersFromAnswers', () => {
  it('recomputes counters from stored rows', () => {
    expect(
      countersFromAnswers([
        { isCorrect: true, timeSpentSeconds: 20, answered: true },
        { isCorrect: false, timeSpentSeconds: 40, answered: true },
        { isCorrect: null, timeSpentSeconds: -5, answered: false },
      ]),
    ).toEqual({ answeredCount: 2, correctCount: 1, timeSpentSeconds: 60 })
  })
})
