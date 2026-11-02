import { describe, expect, it } from 'vitest'
import { composeDiagnostic, diagnosticQuestionCount, type DiagnosticCandidate } from '@/features/diagnostic/compose'
import { clockOffsetMs, crossedWarnings, remainingSeconds } from '@/features/diagnostic/clock'
import { DiagnosticAnswerSchema } from '@/features/diagnostic/schemas'

function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const domains = [
  { domainId: 'd1', name: 'Algebra' },
  { domainId: 'd2', name: 'Geometry and Trigonometry' },
]

function bank(domainId: string, perDifficulty: number, skills = 3): DiagnosticCandidate[] {
  const out: DiagnosticCandidate[] = []
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    for (let i = 0; i < perDifficulty; i++) out.push({ id: `${domainId}-${difficulty}-${i}`, domainId, skillId: `${domainId}-s${i % skills}`, difficulty })
  }
  return out
}

describe('composeDiagnostic', () => {
  it('takes exactly questions_per_domain from every domain, in domain order', () => {
    const result = composeDiagnostic({ domains, candidates: [...bank('d1', 4), ...bank('d2', 4)], perDomain: 3, rng: seeded(1) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.questionIds).toHaveLength(6)
    expect(result.questionIds.slice(0, 3).every((id) => id.startsWith('d1'))).toBe(true)
    expect(result.questionIds.slice(3).every((id) => id.startsWith('d2'))).toBe(true)
    expect(new Set(result.questionIds).size).toBe(6)
  })

  it('spreads difficulty easy → medium → hard round-robin', () => {
    const result = composeDiagnostic({ domains: [domains[0]!], candidates: bank('d1', 5), perDomain: 5, rng: seeded(2) })
    if (!result.ok) throw new Error('expected ok')
    const difficulties = result.questionIds.map((id) => id.split('-')[1])
    expect(difficulties).toEqual(['easy', 'medium', 'hard', 'easy', 'medium'])
  })

  it('fills from other difficulties when one is missing', () => {
    const candidates = bank('d1', 3).filter((c) => c.difficulty !== 'hard')
    const result = composeDiagnostic({ domains: [domains[0]!], candidates, perDomain: 4, rng: seeded(3) })
    if (!result.ok) throw new Error('expected ok')
    expect(result.questionIds).toHaveLength(4)
    expect(result.questionIds.filter((id) => id.includes('easy'))).toHaveLength(2)
    expect(result.questionIds.filter((id) => id.includes('medium'))).toHaveLength(2)
  })

  it('covers different skills before repeating one', () => {
    const result = composeDiagnostic({ domains: [domains[0]!], candidates: bank('d1', 6, 3), perDomain: 3, rng: seeded(4) })
    if (!result.ok) throw new Error('expected ok')
    const skillOf = (id: string) => `d1-s${Number(id.split('-')[2]) % 3}`
    expect(new Set(result.questionIds.map(skillOf)).size).toBe(3)
  })

  it('prefers questions the student has never answered', () => {
    const candidates = bank('d1', 2)
    const history = new Map(candidates.filter((c) => c.id.endsWith('-0')).map((c) => [c.id, true]))
    const result = composeDiagnostic({ domains: [domains[0]!], candidates, perDomain: 3, history, rng: seeded(5) })
    if (!result.ok) throw new Error('expected ok')
    expect(result.questionIds.every((id) => id.endsWith('-1'))).toBe(true)
  })

  it('fails with the domain name when a domain lacks published questions', () => {
    const result = composeDiagnostic({ domains, candidates: [...bank('d1', 2), ...bank('d2', 1).slice(0, 2)], perDomain: 3 })
    expect(result).toEqual({ ok: false, reason: 'not_enough_questions', domainId: 'd2', domainName: 'Geometry and Trigonometry', needed: 3, available: 2 })
  })

  it('fails for an empty scope', () => {
    expect(composeDiagnostic({ domains: [], candidates: [], perDomain: 2 })).toEqual({ ok: false, reason: 'empty_scope' })
  })

  it('counts questions as domains × per-domain', () => {
    expect(diagnosticQuestionCount(8, 2)).toBe(16)
    expect(diagnosticQuestionCount(4, 3)).toBe(12)
  })
})

describe('diagnostic clock', () => {
  it('derives remaining time from the server deadline, not the client clock', () => {
    const clientNow = 1_000_000
    // Client clock is 60 s behind the server.
    const offset = clockOffsetMs(new Date(clientNow + 60_000).toISOString(), clientNow)
    const deadline = new Date(clientNow + 60_000 + 120_000).toISOString()
    expect(remainingSeconds(deadline, offset, clientNow)).toBe(120)
    expect(remainingSeconds(deadline, offset, clientNow + 500_000)).toBe(0)
    expect(remainingSeconds(null, offset, clientNow)).toBeNull()
  })
  it('announces 5- and 1-minute marks once', () => {
    expect(crossedWarnings(301, 300)).toEqual([300])
    expect(crossedWarnings(300, 299)).toEqual([])
    expect(crossedWarnings(61, 60)).toEqual([60])
    expect(crossedWarnings(400, 50)).toEqual([300, 60])
    expect(crossedWarnings(null, 50)).toEqual([])
  })
})

describe('DiagnosticAnswerSchema', () => {
  const ids = { attemptId: '0b5c2c55-7f6b-4c38-9a8e-2b1a4c1f7d10', questionId: '1b5c2c55-7f6b-4c38-9a8e-2b1a4c1f7d10' }
  it('requires something to save', () => {
    expect(DiagnosticAnswerSchema.safeParse(ids).success).toBe(false)
    expect(DiagnosticAnswerSchema.safeParse({ ...ids, markedForReview: true }).success).toBe(true)
    expect(DiagnosticAnswerSchema.safeParse({ ...ids, selectedOptionId: null }).success).toBe(true)
  })
  it('never accepts correctness from the client', () => {
    const parsed = DiagnosticAnswerSchema.parse({ ...ids, responseText: '3/4', isCorrect: true })
    expect('isCorrect' in parsed).toBe(false)
  })
})
