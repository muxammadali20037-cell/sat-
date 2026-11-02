import { describe, expect, it } from 'vitest'
import {
  answerGate,
  computeResults,
  derivePhase,
  isPastGrace,
  moduleSecondsUsed,
  modulesToExpire,
  nextStep,
  secondModuleVariant,
  submissionTime,
  type ModuleRuntime,
} from '@/features/exams/machine'

const T0 = Date.parse('2026-11-02T10:00:00.000Z')
const at = (secondsAfterT0: number) => new Date(T0 + secondsAfterT0 * 1000)
const iso = (secondsAfterT0: number) => at(secondsAfterT0).toISOString()

let seq = 0
function mod(partial: Partial<ModuleRuntime> & Pick<ModuleRuntime, 'sequence'>): ModuleRuntime {
  const plan = [
    { section: 'reading_writing', moduleNumber: 1 },
    { section: 'reading_writing', moduleNumber: 2 },
    { section: 'math', moduleNumber: 1 },
    { section: 'math', moduleNumber: 2 },
  ] as const
  const slot = plan[partial.sequence - 1]!
  seq += 1
  return {
    id: `m${seq}`,
    section: slot.section,
    moduleNumber: slot.moduleNumber,
    variant: 'standard',
    status: 'ready',
    durationSeconds: 1920,
    startedAt: null,
    deadlineAt: null,
    submittedAt: null,
    totalQuestions: 27,
    correctCount: null,
    ...partial,
  }
}

const done = (sequence: number, correct: number, total: number, extra: Partial<ModuleRuntime> = {}) =>
  mod({ sequence, status: 'submitted', startedAt: iso(0), deadlineAt: iso(1920), submittedAt: iso(1000), totalQuestions: total, correctCount: correct, ...extra })

const adaptive = { isAdaptive: true, routingThreshold: 0.6, breakSeconds: 600 }

describe('routing threshold', () => {
  it('routes to harder exactly at the threshold and easier just below', () => {
    expect(secondModuleVariant(true, 18, 30, 0.6)).toBe('harder') // 0.6
    expect(secondModuleVariant(true, 17, 30, 0.6)).toBe('easier') // 0.5667
    expect(secondModuleVariant(true, 27, 27, 0.6)).toBe('harder')
    expect(secondModuleVariant(true, 0, 27, 0.6)).toBe('easier')
  })
  it('treats an empty module 1 as easier and non-adaptive exams as standard', () => {
    expect(secondModuleVariant(true, 0, 0, 0.6)).toBe('easier')
    expect(secondModuleVariant(false, 27, 27, 0.6)).toBe('standard')
  })
  it('respects custom thresholds', () => {
    expect(secondModuleVariant(true, 20, 27, 0.75)).toBe('easier') // 0.7407
    expect(secondModuleVariant(true, 21, 27, 0.75)).toBe('harder') // 0.7778
  })
})

describe('nextStep (progression)', () => {
  it('creates RW module 1 for a new attempt', () => {
    expect(nextStep('in_progress', [], adaptive)).toEqual({
      kind: 'create_module',
      slot: { sequence: 1, section: 'reading_writing', moduleNumber: 1 },
      variant: 'standard',
    })
  })
  it('waits while a module is ready or in progress', () => {
    expect(nextStep('in_progress', [mod({ sequence: 1 })], adaptive)).toEqual({ kind: 'wait' })
    expect(nextStep('in_progress', [mod({ sequence: 1, status: 'in_progress', startedAt: iso(0), deadlineAt: iso(1920) })], adaptive)).toEqual({ kind: 'wait' })
  })
  it('scores a finalized module whose count is missing before routing on it', () => {
    const m1 = done(1, 0, 27, { correctCount: null })
    expect(nextStep('in_progress', [m1], adaptive)).toEqual({ kind: 'score_module', moduleId: m1.id })
  })
  it('routes module 2 from module 1 accuracy (adaptive)', () => {
    expect(nextStep('in_progress', [done(1, 17, 27)], adaptive)).toMatchObject({ kind: 'create_module', slot: { sequence: 2 }, variant: 'harder' })
    expect(nextStep('in_progress', [done(1, 16, 27)], adaptive)).toMatchObject({ kind: 'create_module', slot: { sequence: 2 }, variant: 'easier' })
  })
  it('uses the standard module 2 for non-adaptive exams', () => {
    expect(nextStep('in_progress', [done(1, 27, 27)], { ...adaptive, isAdaptive: false })).toMatchObject({ variant: 'standard', slot: { sequence: 2 } })
  })
  it('creates Math module 1 after RW module 2, then routes Math module 2 on Math module 1 only', () => {
    expect(nextStep('in_progress', [done(1, 27, 27), done(2, 0, 27, { variant: 'harder' })], adaptive)).toMatchObject({
      slot: { sequence: 3, section: 'math', moduleNumber: 1 },
      variant: 'standard',
    })
    const mathM1 = done(3, 5, 22)
    expect(nextStep('in_progress', [done(1, 27, 27), done(2, 27, 27, { variant: 'harder' }), mathM1], adaptive)).toMatchObject({
      slot: { sequence: 4 },
      variant: 'easier',
    })
  })
  it('finalizes the attempt after the fourth module and is done afterwards', () => {
    const all = [done(1, 20, 27), done(2, 20, 27, { variant: 'harder' }), done(3, 15, 22), done(4, 15, 22, { variant: 'harder' })]
    expect(nextStep('in_progress', all, adaptive)).toEqual({ kind: 'finalize_attempt' })
    expect(nextStep('completed', all, adaptive)).toEqual({ kind: 'done' })
  })
})

describe('lazy expiry and answer gate', () => {
  const running = mod({ sequence: 1, status: 'in_progress', startedAt: iso(0), deadlineAt: iso(1920) })

  it('does not expire within the grace window', () => {
    expect(isPastGrace(running, at(1920), 5)).toBe(false)
    expect(isPastGrace(running, at(1925), 5)).toBe(false)
    expect(isPastGrace(running, at(1925.001), 5)).toBe(true)
    expect(modulesToExpire([running, mod({ sequence: 2 })], at(2000), 5)).toEqual([running])
  })
  it('never expires modules that are not in progress', () => {
    expect(isPastGrace(done(1, 1, 27), at(99999), 5)).toBe(false)
    expect(isPastGrace(mod({ sequence: 1 }), at(99999), 5)).toBe(false)
  })
  it('accepts answers until deadline + grace and rejects afterwards', () => {
    expect(answerGate(running, at(10), 5)).toEqual({ ok: true })
    expect(answerGate(running, at(1924), 5)).toEqual({ ok: true })
    expect(answerGate(running, at(1926), 5)).toEqual({ ok: false, code: 'TIME_EXPIRED' })
  })
  it('rejects answers for submitted, ready or unknown modules', () => {
    expect(answerGate(done(1, 3, 27), at(10), 5)).toEqual({ ok: false, code: 'TIME_EXPIRED' })
    expect(answerGate(mod({ sequence: 2 }), at(10), 5)).toEqual({ ok: false, code: 'MODULE_NOT_ACTIVE' })
    expect(answerGate(undefined, at(10), 5)).toEqual({ ok: false, code: 'MODULE_NOT_ACTIVE' })
  })
  it('records submission time no later than the deadline', () => {
    expect(submissionTime(running, 'expired', at(5000))).toBe(iso(1920))
    expect(submissionTime(running, 'submitted', at(1923))).toBe(iso(1920))
    expect(submissionTime(running, 'submitted', at(600))).toBe(iso(600))
  })
  it('counts seconds used, capped at the module duration', () => {
    expect(moduleSecondsUsed(done(1, 0, 27, { submittedAt: iso(600) }))).toBe(600)
    expect(moduleSecondsUsed(done(1, 0, 27, { submittedAt: iso(5000) }))).toBe(1920)
    expect(moduleSecondsUsed(mod({ sequence: 1 }))).toBe(0)
  })
})

describe('derivePhase', () => {
  it('is in_module while a module runs', () => {
    const running = mod({ sequence: 1, status: 'in_progress', startedAt: iso(0), deadlineAt: iso(1920) })
    expect(derivePhase('in_progress', [running], adaptive, at(5))).toMatchObject({ phase: 'in_module', current: running })
  })
  it('auto-begins module 2 right after module 1', () => {
    const next = mod({ sequence: 2, variant: 'harder' })
    expect(derivePhase('in_progress', [done(1, 20, 27), next], adaptive, at(1100))).toMatchObject({ phase: 'ready_to_begin', next, autoBegin: true })
  })
  it('shows the break until RW M2 submission + break seconds, then waits to begin Math', () => {
    const modules = [done(1, 20, 27), done(2, 20, 27, { submittedAt: iso(3000) }), mod({ sequence: 3, durationSeconds: 2100 })]
    expect(derivePhase('in_progress', modules, adaptive, at(3100))).toMatchObject({ phase: 'break', breakEndsAt: iso(3600) })
    expect(derivePhase('in_progress', modules, adaptive, at(3600))).toMatchObject({ phase: 'ready_to_begin', autoBegin: false })
    expect(derivePhase('in_progress', modules, { breakSeconds: 0 }, at(3100))).toMatchObject({ phase: 'ready_to_begin' })
  })
  it('is completed once the attempt is completed', () => {
    expect(derivePhase('completed', [], adaptive, at(0)).phase).toBe('completed')
  })
})

describe('computeResults (estimate integration)', () => {
  it('uses the module-2 route of each section and sums the ranges', () => {
    const modules = [
      done(1, 27, 27),
      done(2, 27, 27, { variant: 'harder' }),
      done(3, 11, 22, { durationSeconds: 2100 }),
      done(4, 11, 22, { variant: 'easier', durationSeconds: 2100 }),
    ]
    const r = computeResults(modules)
    expect(r.sections.reading_writing?.estimate).toEqual({ point: 800, low: 760, high: 800 })
    // easier: 200 + 420 × 0.5 = 410
    expect(r.sections.math?.estimate).toEqual({ point: 410, low: 370, high: 450 })
    expect(r.total).toEqual({ point: 1210, low: 1130, high: 1250 })
    expect(r.correct).toBe(76)
    expect(r.totalQuestions).toBe(98)
  })
  it('caps the easier route at 620 and uses overall accuracy for standard', () => {
    const r = computeResults([done(1, 15, 27), done(2, 27, 27, { variant: 'easier' }), done(3, 22, 22), done(4, 0, 22, { variant: 'standard' })])
    // easier: 200 + 420 × (15/27 + 1) / 2 = 526.7 → 530
    expect(r.sections.reading_writing?.estimate.point).toBe(530)
    // standard: 200 + 600 × 22/44 = 500
    expect(r.sections.math?.estimate).toEqual({ point: 500, low: 460, high: 540 })
    const perfectEasier = computeResults([done(1, 0, 27), done(2, 27, 27, { variant: 'easier' }), done(3, 22, 22), done(4, 22, 22, { variant: 'easier' })])
    expect(perfectEasier.sections.math?.estimate.point).toBe(620) // ceiling of the easier route
  })
  it('returns no total until both sections exist', () => {
    expect(computeResults([done(1, 10, 27)]).total).toBeNull()
  })
})
