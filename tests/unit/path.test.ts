import { describe, expect, it } from 'vitest'
import { buildPath, STAGES, type PathStats } from '@/features/path/stages'

const base: PathStats = { estimate: null, diagnosticsCompleted: 0, lessonsCompleted: 0, correct: { easy: 0, medium: 0, hard: 0 }, mocksCompleted: 0, longestStreak: 0, words: 0 }

describe('0 → 1600 path', () => {
  it('stages cover 400–1600 without gaps', () => {
    expect(STAGES[0].from).toBe(400)
    expect(STAGES.at(-1)!.goal).toBe(1600)
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].from).toBe(STAGES[i - 1].goal)
  })

  it('without an estimate the student starts at Foundation and nothing is passed', () => {
    const p = buildPath(base)
    expect(p.current.id).toBe('foundation')
    expect(p.stages.filter((s) => s.state === 'passed')).toHaveLength(0)
    expect(p.bandProgress).toBe(0)
    expect(p.overall).toBe(0)
  })

  it('missions never pass a stage: only the score does', () => {
    const p = buildPath({ ...base, diagnosticsCompleted: 1, lessonsCompleted: 99, correct: { easy: 999, medium: 999, hard: 999 }, mocksCompleted: 20, longestStreak: 60, words: 500 })
    expect(p.current.id).toBe('foundation')
    expect(p.current.missionViews.every((m) => m.done)).toBe(true)
    expect(p.stages.filter((s) => s.state === 'passed')).toHaveLength(0)
  })

  it('places the student by the estimate; a goal reached means that stage is passed', () => {
    expect(buildPath({ ...base, estimate: 799 }).current.id).toBe('foundation')
    const p = buildPath({ ...base, estimate: 800 })
    expect(p.current.id).toBe('climb')
    expect(p.stages[0].state).toBe('passed')
    expect(buildPath({ ...base, estimate: 1210 }).current.id).toBe('strong')
    expect(buildPath({ ...base, estimate: 1460 }).current.id).toBe('summit')
  })

  it('band and overall progress', () => {
    const p = buildPath({ ...base, estimate: 900 })
    expect(p.bandProgress).toBe(50)
    expect(p.overall).toBe(42)
  })

  it('1600 passes everything; out-of-range estimates are clamped', () => {
    const p = buildPath({ ...base, estimate: 1600 })
    expect(p.allPassed).toBe(true)
    expect(p.stages.every((s) => s.state === 'passed')).toBe(true)
    expect(buildPath({ ...base, estimate: 9999 }).allPassed).toBe(true)
    expect(buildPath({ ...base, estimate: 120 }).current.id).toBe('foundation')
  })

  it('mission values are capped at the target and never negative', () => {
    const m = buildPath({ ...base, lessonsCompleted: 12, correct: { easy: -5, medium: 0, hard: 0 } }).current.missionViews
    expect(m.find((x) => x.id === 'lessons')).toMatchObject({ value: 5, target: 5, done: true })
    expect(m.find((x) => x.id === 'easy')).toMatchObject({ value: 0, done: false })
  })
})
