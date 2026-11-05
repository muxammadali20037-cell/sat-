import { describe, expect, it } from 'vitest'
import {
  allocateAutoFill,
  apportion,
  difficultyTargets,
  requiredModuleSpecs,
  validateExamForPublish,
  type PoolQuestion,
  type ValidationModule,
} from '@/features/exams/builder'

/** Deterministic PRNG (mulberry32) so allocation tests are reproducible. */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RW_DOMAINS = [
  { id: 'cs', weightPercent: 28, position: 1 },
  { id: 'ii', weightPercent: 26, position: 2 },
  { id: 'sec', weightPercent: 26, position: 3 },
  { id: 'eoi', weightPercent: 20, position: 4 },
]
const MATH_DOMAINS = [
  { id: 'alg', weightPercent: 35, position: 1 },
  { id: 'adv', weightPercent: 35, position: 2 },
  { id: 'psda', weightPercent: 15, position: 3 },
  { id: 'geo', weightPercent: 15, position: 4 },
]

function bank(domains: typeof RW_DOMAINS, perDomainPerDifficulty: number): PoolQuestion[] {
  const out: PoolQuestion[] = []
  for (const d of domains)
    for (const difficulty of ['easy', 'medium', 'hard'] as const)
      for (let i = 0; i < perDomainPerDifficulty; i++) out.push({ id: `${d.id}-${difficulty}-${i}`, domainId: d.id, skillId: `${d.id}-s${i % 3}`, difficulty })
  return out
}

describe('apportion (largest remainder)', () => {
  it('splits 27 RW questions by official weights exactly', () => {
    const m = apportion(27, RW_DOMAINS.map((d) => ({ key: d.id, weight: d.weightPercent })))
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(27)
    expect(Object.fromEntries(m)).toEqual({ cs: 8, ii: 7, sec: 7, eoi: 5 })
  })
  it('splits 22 Math questions by official weights exactly', () => {
    const m = apportion(22, MATH_DOMAINS.map((d) => ({ key: d.id, weight: d.weightPercent })))
    expect(Object.fromEntries(m)).toEqual({ alg: 8, adv: 8, psda: 3, geo: 3 })
  })
  it('handles zero totals and zero weights', () => {
    expect(Object.fromEntries(apportion(0, [{ key: 'a', weight: 1 }]))).toEqual({ a: 0 })
    expect(Object.fromEntries(apportion(5, [{ key: 'a', weight: 0 }, { key: 'b', weight: 2 }]))).toEqual({ a: 0, b: 5 })
  })
})

describe('difficulty targets', () => {
  it('mixes module 1, and narrows module 2 by route', () => {
    expect(difficultyTargets(1, 'standard').map((t) => t.difficulty)).toEqual(['easy', 'medium', 'hard'])
    expect(difficultyTargets(2, 'easier').map((t) => t.difficulty)).toEqual(['easy', 'medium'])
    expect(difficultyTargets(2, 'harder').map((t) => t.difficulty)).toEqual(['medium', 'hard'])
    expect(difficultyTargets(2, 'standard').map((t) => t.difficulty)).toEqual(['easy', 'medium', 'hard'])
  })
})

describe('allocateAutoFill', () => {
  it('fills a full RW module by domain weight with no duplicates', () => {
    const pool = bank(RW_DOMAINS, 10)
    const r = allocateAutoFill({ targetCount: 27, domains: RW_DOMAINS, moduleNumber: 1, variant: 'standard', section: 'reading_writing', existing: [], pool, random: rng(1) })
    expect(r.selected).toHaveLength(27)
    expect(new Set(r.selected).size).toBe(27)
    expect(r.shortfall).toBe(0)
    const byDomain = (id: string) => r.selected.filter((q) => q.startsWith(`${id}-`)).length
    expect([byDomain('cs'), byDomain('ii'), byDomain('sec'), byDomain('eoi')]).toEqual([8, 7, 7, 5])
    // RW order: grouped by domain position
    const order = r.selected.map((q) => q.split('-')[0])
    expect(order).toEqual([...order].sort((a, b) => RW_DOMAINS.findIndex((d) => d.id === a) - RW_DOMAINS.findIndex((d) => d.id === b)))
  })
  it('uses only medium/hard for the harder module 2 when the bank allows', () => {
    const r = allocateAutoFill({ targetCount: 22, domains: MATH_DOMAINS, moduleNumber: 2, variant: 'harder', section: 'math', existing: [], pool: bank(MATH_DOMAINS, 10), random: rng(2) })
    expect(r.selected).toHaveLength(22)
    expect(r.selected.every((id) => !id.includes('-easy-'))).toBe(true)
    // Math order: non-decreasing difficulty
    const rank = (id: string) => (id.includes('-easy-') ? 0 : id.includes('-medium-') ? 1 : 2)
    const ranks = r.selected.map(rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
  it('uses only easy/medium for the easier module 2', () => {
    const r = allocateAutoFill({ targetCount: 22, domains: MATH_DOMAINS, moduleNumber: 2, variant: 'easier', section: 'math', existing: [], pool: bank(MATH_DOMAINS, 10), random: rng(3) })
    expect(r.selected.every((id) => !id.includes('-hard-'))).toBe(true)
  })
  it('appends around existing questions and never returns them', () => {
    const pool = bank(MATH_DOMAINS, 10)
    const existing = pool.filter((q) => q.domainId === 'alg').slice(0, 8)
    const r = allocateAutoFill({ targetCount: 22, domains: MATH_DOMAINS, moduleNumber: 1, variant: 'standard', section: 'math', existing, pool, random: rng(4) })
    expect(r.selected).toHaveLength(14)
    expect(r.selected.some((id) => existing.some((e) => e.id === id))).toBe(false)
    expect(r.selected.filter((id) => id.startsWith('alg-'))).toHaveLength(0) // algebra quota already met
  })
  it('never overfills when existing questions sit unevenly across domains', () => {
    const pool = bank(MATH_DOMAINS, 20)
    // 15 algebra questions already placed: far above algebra's share of 22.
    const existing = pool.filter((q) => q.domainId === 'alg').slice(0, 15)
    const r = allocateAutoFill({ targetCount: 22, domains: MATH_DOMAINS, moduleNumber: 1, variant: 'standard', section: 'math', existing, pool, random: rng(9) })
    expect(r.selected).toHaveLength(7)
    expect(r.shortfall).toBe(0)
    expect(new Set([...r.selected, ...existing.map((e) => e.id)]).size).toBe(22)
  })
  it('falls back to other difficulties and domains, then reports the shortfall', () => {
    const tiny: PoolQuestion[] = [
      { id: 'a1', domainId: 'alg', skillId: 's', difficulty: 'easy' },
      { id: 'a2', domainId: 'alg', skillId: 's', difficulty: 'easy' },
      { id: 'g1', domainId: 'geo', skillId: 's', difficulty: 'hard' },
    ]
    const r = allocateAutoFill({ targetCount: 5, domains: MATH_DOMAINS, moduleNumber: 2, variant: 'harder', section: 'math', existing: [], pool: tiny, random: rng(5) })
    expect(new Set(r.selected)).toEqual(new Set(['a1', 'a2', 'g1']))
    expect(r.shortfall).toBe(2)
  })
})

describe('module specs and publish validation', () => {
  it('creates 6 modules for adaptive exams and 4 for fixed ones', () => {
    expect(requiredModuleSpecs(true)).toHaveLength(6)
    expect(requiredModuleSpecs(false)).toHaveLength(4)
    expect(requiredModuleSpecs(true).find((s) => s.section === 'math')?.durationSeconds).toBe(2100)
    expect(requiredModuleSpecs(true).find((s) => s.section === 'reading_writing')?.durationSeconds).toBe(1920)
  })

  const qs = (prefix: string, n: number, subject: 'math' | 'reading_writing', status = 'published') =>
    Array.from({ length: n }, (_, i) => ({ questionId: `${prefix}${i}`, status, subjectCode: subject }))
  const fullAdaptive = (): ValidationModule[] => [
    { section: 'reading_writing', moduleNumber: 1, variant: 'standard', questions: qs('r1-', 27, 'reading_writing') },
    { section: 'reading_writing', moduleNumber: 2, variant: 'easier', questions: qs('r2e-', 27, 'reading_writing') },
    { section: 'reading_writing', moduleNumber: 2, variant: 'harder', questions: qs('r2h-', 27, 'reading_writing') },
    { section: 'math', moduleNumber: 1, variant: 'standard', questions: qs('m1-', 22, 'math') },
    { section: 'math', moduleNumber: 2, variant: 'easier', questions: qs('m2e-', 22, 'math') },
    { section: 'math', moduleNumber: 2, variant: 'harder', questions: qs('m2h-', 22, 'math') },
  ]

  it('accepts a complete full-length adaptive exam', () => {
    expect(validateExamForPublish({ isAdaptive: true, isFullLength: true }, fullAdaptive())).toEqual([])
  })
  it('requires exact counts for full-length but not for shortened exams', () => {
    const modules = fullAdaptive()
    modules[0]!.questions = modules[0]!.questions.slice(0, 10)
    expect(validateExamForPublish({ isAdaptive: true, isFullLength: true }, modules)[0]).toMatch(/has 10 questions/)
    expect(validateExamForPublish({ isAdaptive: true, isFullLength: false }, modules)).toEqual([])
  })
  it('flags empty or missing modules, unpublished, wrong-subject and repeated questions', () => {
    const modules = fullAdaptive()
    modules[1]!.questions = []
    modules[2]!.questions[0] = { questionId: 'r1-0', status: 'published', subjectCode: 'reading_writing' } // repeat of M1
    modules[3]!.questions[0] = { questionId: 'x', status: 'draft', subjectCode: 'math' }
    modules[4]!.questions[0] = { questionId: 'y', status: 'published', subjectCode: 'reading_writing' }
    modules.pop()
    const issues = validateExamForPublish({ isAdaptive: true, isFullLength: false }, modules).join(' | ')
    expect(issues).toMatch(/Module 2 \(easier\) has no questions/)
    expect(issues).toMatch(/appears in both/)
    expect(issues).toMatch(/not published/)
    expect(issues).toMatch(/other subject/)
    expect(issues).toMatch(/Math · Module 2 \(harder\) is missing/)
  })
})
