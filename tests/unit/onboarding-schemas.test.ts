import { describe, expect, it } from 'vitest'
import {
  clampScore,
  dailyMinutesSchema,
  examDateSchema,
  onboardingSchema,
  scorePosition,
  subjectsSchema,
  targetScoreSchema,
  validateOnboardingStep,
  type OnboardingDraft,
} from '@/features/onboarding/schemas'

const TODAY = '2026-11-02'
const msg = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message

describe('targetScoreSchema (400–1600, step 10)', () => {
  it('accepts valid scores', () => {
    for (const s of [400, 1000, 1350, 1600]) expect(targetScoreSchema.safeParse(s).success).toBe(true)
  })
  it('rejects out-of-range scores', () => {
    expect(msg(targetScoreSchema.safeParse(390))).toBe('scoreRange')
    expect(msg(targetScoreSchema.safeParse(1610))).toBe('scoreRange')
  })
  it('rejects scores that are not multiples of 10', () => {
    expect(msg(targetScoreSchema.safeParse(1355))).toBe('scoreStep')
    expect(msg(targetScoreSchema.safeParse(1350.5))).toBe('scoreStep')
  })
  it('rejects missing values', () => {
    expect(msg(targetScoreSchema.safeParse(Number.NaN))).toBe('scoreRequired')
    expect(msg(targetScoreSchema.safeParse(undefined))).toBe('scoreRequired')
  })
  it('clampScore and scorePosition map onto the scale', () => {
    expect(clampScore(1234)).toBe(1230)
    expect(clampScore(100)).toBe(400)
    expect(clampScore(9999)).toBe(1600)
    expect(scorePosition(400)).toBe(0)
    expect(scorePosition(1000)).toBe(0.5)
    expect(scorePosition(1600)).toBe(1)
  })
})

describe('examDateSchema (strictly in the future)', () => {
  const schema = examDateSchema(TODAY)
  it('accepts tomorrow and later', () => {
    expect(schema.safeParse('2026-11-03').success).toBe(true)
    expect(schema.safeParse('2027-03-13').success).toBe(true)
  })
  it('rejects today and past dates', () => {
    expect(msg(schema.safeParse('2026-11-02'))).toBe('dateInPast')
    expect(msg(schema.safeParse('2025-12-01'))).toBe('dateInPast')
  })
  it('rejects invalid dates and dates more than three years away', () => {
    expect(msg(schema.safeParse('2026-13-01'))).toBe('dateInvalid')
    expect(msg(schema.safeParse('03/13/2027'))).toBe('dateInvalid')
    expect(msg(schema.safeParse('2031-01-01'))).toBe('dateTooFar')
  })
})

describe('daily minutes and subjects', () => {
  it('accepts 10–600 whole minutes', () => {
    expect(dailyMinutesSchema.safeParse(10).success).toBe(true)
    expect(dailyMinutesSchema.safeParse(600).success).toBe(true)
    expect(msg(dailyMinutesSchema.safeParse(5))).toBe('minutesRange')
    expect(msg(dailyMinutesSchema.safeParse(601))).toBe('minutesRange')
    expect(msg(dailyMinutesSchema.safeParse(null))).toBe('minutesRequired')
  })
  it('needs one or two distinct known subjects', () => {
    expect(subjectsSchema.safeParse(['math']).success).toBe(true)
    expect(subjectsSchema.safeParse(['math', 'reading_writing']).success).toBe(true)
    expect(msg(subjectsSchema.safeParse([]))).toBe('subjectsRequired')
    expect(msg(subjectsSchema.safeParse(['math', 'math']))).toBe('subjectsRequired')
    expect(subjectsSchema.safeParse(['science']).success).toBe(false)
  })
})

describe('onboarding payload', () => {
  const valid = {
    fullName: 'Aziza Karimova',
    locale: 'uz' as const,
    satLevel: 'some_prep' as const,
    targetScore: 1400,
    examDate: '2027-03-13',
    dailyStudyMinutes: 45,
    preferredSubjects: ['math' as const, 'reading_writing' as const],
  }
  it('accepts a complete payload, with or without an exam date', () => {
    expect(onboardingSchema(TODAY).safeParse(valid).success).toBe(true)
    expect(onboardingSchema(TODAY).safeParse({ ...valid, examDate: null }).success).toBe(true)
  })
  it('strips unknown keys (e.g. role) instead of passing them to the database', () => {
    const r = onboardingSchema(TODAY).parse({ ...valid, role: 'ADMIN', is_suspended: false })
    expect(r).not.toHaveProperty('role')
    expect(r).not.toHaveProperty('is_suspended')
  })
  it('rejects a missing level', () => {
    expect(onboardingSchema(TODAY).safeParse({ ...valid, satLevel: null }).success).toBe(false)
  })

  it('validates one wizard step at a time', () => {
    const draft: OnboardingDraft = {
      fullName: 'A',
      locale: 'en',
      satLevel: null,
      targetScore: 1405,
      examDate: '2026-11-01',
      dailyStudyMinutes: null,
      preferredSubjects: [],
    }
    expect(validateOnboardingStep(0, draft, TODAY)).toEqual({ fullName: 'nameTooShort' })
    expect(validateOnboardingStep(1, draft, TODAY)).toEqual({})
    expect(validateOnboardingStep(2, draft, TODAY)).toEqual({ satLevel: 'levelRequired' })
    expect(validateOnboardingStep(3, draft, TODAY)).toEqual({ targetScore: 'scoreStep' })
    expect(validateOnboardingStep(4, draft, TODAY)).toEqual({ examDate: 'dateInPast' })
    expect(validateOnboardingStep(5, draft, TODAY)).toEqual({ dailyStudyMinutes: 'minutesRequired' })
    expect(validateOnboardingStep(6, draft, TODAY)).toEqual({ preferredSubjects: 'subjectsRequired' })
    expect(validateOnboardingStep(4, { ...draft, examDate: null }, TODAY)).toEqual({})
  })
})
