/**
 * Learning Intelligence v1: every insight must be derived from the student's own answers and
 * carry the evidence it was computed from. Thin data → no answer-based insight.
 */
import { describe, expect, it } from 'vitest'
import { analyze, MIN_ANSWERS, type AnswerSignal, type EngineInput, type Insight } from '@/features/intelligence/engine'
import { insightText } from '@/components/dashboard/insights'
import { intelligenceDict } from '@/lib/i18n/dictionaries/intelligence'
import { resolveDict } from '@/lib/i18n/dict'

const NOW = new Date('2026-11-03T12:00:00Z')
const daysAgo = (d: number, h = 0) => new Date(NOW.getTime() - d * 86_400_000 - h * 3_600_000).toISOString()

const SKILLS = new Map([
  ['sk-quad', { name: 'Quadratic equations', domainId: 'd-adv' }],
  ['sk-lin', { name: 'Linear equations', domainId: 'd-alg' }],
  ['sk-words', { name: 'Words in context', domainId: 'd-craft' }],
])
const DOMAINS = new Map([
  ['d-adv', { name: 'Advanced Math', subjectCode: 'math' as const }],
  ['d-alg', { name: 'Algebra', subjectCode: 'math' as const }],
  ['d-craft', { name: 'Craft and Structure', subjectCode: 'reading_writing' as const }],
])

function ans(p: Partial<AnswerSignal> & { skillId: string }, n: number, correct: number, opts: { day?: number; seconds?: number } = {}): AnswerSignal[] {
  const skill = SKILLS.get(p.skillId)!
  const subjectCode = DOMAINS.get(skill.domainId)!.subjectCode
  return Array.from({ length: n }, (_, i) => ({
    domainId: skill.domainId,
    subjectCode,
    difficulty: 'medium' as const,
    seconds: opts.seconds ?? 0,
    answeredAt: daysAgo(opts.day ?? 1, i % 10),
    ...p,
    isCorrect: i < correct,
  }))
}

function input(answers: AnswerSignal[], over: Partial<EngineInput> = {}): EngineInput {
  return {
    now: NOW,
    answers,
    activeDaysLast14: 7,
    hasHistory: answers.length > 0,
    skills: SKILLS,
    domains: DOMAINS,
    estimate: null,
    targetScore: null,
    mocks: { completed: 0, lastCompletedAt: null, available: false },
    flashcardsDue: 0,
    questionsAvailable: true,
    lessonBySkill: new Map(),
    ...over,
  }
}

const kinds = (r: ReturnType<typeof analyze>) => [r.next, ...r.insights].filter(Boolean).map((i) => (i as Insight).kind)

describe('learning intelligence', () => {
  it('returns nothing invented for a student with no data', () => {
    const r = analyze(input([], { hasHistory: false }))
    expect(r.next).toBeNull()
    expect(r.insights).toEqual([])
    expect(r.enoughData).toBe(false)
  })

  it('ignores answer-based rules below the minimum number of answers', () => {
    const r = analyze(input(ans({ skillId: 'sk-quad' }, MIN_ANSWERS - 1, 0)))
    expect(kinds(r)).not.toContain('repeated_mistakes')
    expect(r.enoughData).toBe(false)
  })

  it('flags repeated mistakes in one skill with evidence, and prefers an unfinished lesson', () => {
    const answers = [...ans({ skillId: 'sk-quad' }, 6, 1), ...ans({ skillId: 'sk-lin' }, 10, 9)]
    const r = analyze(input(answers, { lessonBySkill: new Map([['sk-quad', { id: 'L1', title: 'Quadratics', minutes: 15 }]]) }))
    expect(r.next?.kind).toBe('repeated_mistakes')
    expect(r.next?.evidence).toEqual({ skillName: 'Quadratic equations', wrong: 5, answered: 6, days: 14 })
    expect(r.next?.action).toEqual({ kind: 'lesson', href: '/dashboard/lesson/L1', minutes: 15, title: 'Quadratics' })
  })

  it('falls back to skill practice when no lesson exists, and ignores mistakes older than the window', () => {
    const fresh = analyze(input([...ans({ skillId: 'sk-quad' }, 6, 1), ...ans({ skillId: 'sk-lin' }, 10, 9)]))
    expect(fresh.next?.action).toEqual({ kind: 'practice', href: '/dashboard/practice?subject=math&domain=d-adv&skill=sk-quad' })
    const old = analyze(input([...ans({ skillId: 'sk-quad' }, 6, 1, { day: 20 }), ...ans({ skillId: 'sk-lin' }, 10, 9)]))
    expect(kinds(old)).not.toContain('repeated_mistakes')
  })

  it('suggests fundamentals when hard questions dominate and the basics are weak', () => {
    const answers = [...ans({ skillId: 'sk-quad', difficulty: 'hard' }, 12, 3), ...ans({ skillId: 'sk-lin', difficulty: 'easy' }, 10, 5)]
    const r = analyze(input(answers))
    const f = [r.next, ...r.insights].find((i) => i?.kind === 'fundamentals_first')
    expect(f?.evidence).toMatchObject({ subject: 'math', hardAccuracy: 0.25, basicsAccuracy: 0.5 })
    expect(f?.action).toEqual({ kind: 'practice', href: '/dashboard/practice?subject=math&difficulty=medium' })
  })

  it('recommends a timed drill when the median time is well above SAT pace', () => {
    const r = analyze(input(ans({ skillId: 'sk-lin' }, 12, 10, { seconds: 150 })))
    const slow = [r.next, ...r.insights].find((i) => i?.kind === 'slow_pace')
    expect(slow?.evidence).toEqual({ subject: 'math', medianSeconds: 150, paceSeconds: 95, answered: 12 })
    expect(slow?.action?.href).toBe('/dashboard/practice?subject=math&timed=1')
  })

  it('does not judge pace from unmeasured answers', () => {
    const r = analyze(input(ans({ skillId: 'sk-lin' }, 30, 25, { seconds: 0 })))
    expect(kinds(r)).not.toContain('slow_pace')
    expect(kinds(r)).not.toContain('rushing')
  })

  it('caps idle time so one abandoned tab does not decide the median', () => {
    const answers = [...ans({ skillId: 'sk-lin' }, 11, 10, { seconds: 60 }), ...ans({ skillId: 'sk-lin' }, 1, 1, { seconds: 86_000 })]
    expect(kinds(analyze(input(answers)))).not.toContain('slow_pace')
  })

  it('flags rushing only when fast answers are also mostly wrong', () => {
    expect(kinds(analyze(input(ans({ skillId: 'sk-words' }, 12, 3, { seconds: 20 }))))).toContain('rushing')
    expect(kinds(analyze(input(ans({ skillId: 'sk-words' }, 12, 11, { seconds: 20 }))))).not.toContain('rushing')
  })

  it('reports week-over-week improvement and decline per subject', () => {
    const up = [...ans({ skillId: 'sk-words' }, 10, 5, { day: 10 }), ...ans({ skillId: 'sk-words' }, 10, 9, { day: 2 })]
    const r = analyze(input(up))
    const imp = r.insights.find((i) => i.kind === 'improved')
    expect(imp?.evidence).toEqual({ subject: 'reading_writing', before: 0.5, after: 0.9, answered: 20 })
    expect(imp?.action).toBeNull()
    const down = [...ans({ skillId: 'sk-lin' }, 10, 9, { day: 10 }), ...ans({ skillId: 'sk-lin' }, 10, 7, { day: 2 })]
    expect(kinds(analyze(input(down)))).toContain('declined')
  })

  it('names the weakest domain only with enough answers, and not twice', () => {
    const answers = [...ans({ skillId: 'sk-words' }, 12, 5, { day: 40 }), ...ans({ skillId: 'sk-lin' }, 12, 11)]
    const r = analyze(input(answers))
    const w = [r.next, ...r.insights].find((i) => i?.kind === 'weak_domain')
    expect(w?.evidence).toEqual({ domainName: 'Craft and Structure', accuracy: 0.42, answered: 12 })
    // A domain already flagged by repeated mistakes is not repeated as "weakest area".
    const both = analyze(input([...ans({ skillId: 'sk-quad' }, 12, 2)]))
    expect(kinds(both)).toContain('repeated_mistakes')
    expect(kinds(both)).not.toContain('weak_domain')
  })

  it('compares the target with the latest estimate honestly', () => {
    const base = ans({ skillId: 'sk-lin' }, 12, 10)
    const gap = analyze(input(base, { targetScore: 1400, estimate: { low: 1150, high: 1250, at: daysAgo(3) } }))
    expect([gap.next, ...gap.insights].find((i) => i?.kind === 'target_gap')?.evidence).toEqual({ low: 1150, high: 1250, target: 1400, gap: 200 })
    const ok = analyze(input(base, { targetScore: 1200, estimate: { low: 1210, high: 1290, at: daysAgo(3) } }))
    expect(kinds(ok)).toContain('on_track')
    const none = analyze(input(base, { targetScore: 1300 }))
    expect(kinds(none)).toContain('no_estimate')
    expect(kinds(analyze(input(base)))).not.toContain('target_gap')
  })

  it('suggests a mock exam only when mocks exist and enough practice happened since the last one', () => {
    const many = ans({ skillId: 'sk-lin' }, 100, 80)
    expect(kinds(analyze(input(many, { mocks: { completed: 0, lastCompletedAt: null, available: true } })))).toContain('mock_ready')
    expect(kinds(analyze(input(many, { mocks: { completed: 0, lastCompletedAt: null, available: false } })))).not.toContain('mock_ready')
    expect(kinds(analyze(input(many, { mocks: { completed: 1, lastCompletedAt: daysAgo(5), available: true } })))).not.toContain('mock_ready')
  })

  it('handles flashcards and consistency, and puts focus items before praise', () => {
    const r = analyze(input(ans({ skillId: 'sk-lin' }, 12, 11), { flashcardsDue: 7, activeDaysLast14: 12 }))
    expect(r.next?.kind).toBe('flashcards_due')
    expect(r.insights.map((i) => i.kind)).toContain('consistency_strong')
    expect(kinds(analyze(input(ans({ skillId: 'sk-lin' }, 12, 11), { activeDaysLast14: 2 })))).toContain('consistency_low')
  })

  it('renders every insight in en, uz and ru without leftover placeholders', () => {
    const answers = [
      ...ans({ skillId: 'sk-quad', difficulty: 'hard' }, 12, 2, { seconds: 200 }),
      ...ans({ skillId: 'sk-words' }, 10, 5, { day: 10, seconds: 20 }),
      ...ans({ skillId: 'sk-words' }, 10, 2, { day: 2, seconds: 20 }),
    ]
    const r = analyze(input(answers, { targetScore: 1400, estimate: { low: 1100, high: 1200, at: daysAgo(1) }, flashcardsDue: 6, activeDaysLast14: 3 }))
    const all = [r.next!, ...r.insights]
    expect(all.length).toBeGreaterThan(5)
    for (const locale of ['en', 'uz', 'ru'] as const) {
      const t = resolveDict(intelligenceDict, locale)
      for (const i of all) {
        const { title, evidence } = insightText(i, t)
        expect(title + evidence).not.toMatch(/\{\w+\}/)
      }
    }
  })
})
