import { describe, expect, it } from 'vitest'
import { clampTimeSpent, secondsBetween } from '@/features/practice/timing'
import { PracticeAnswerSchema, StartPracticeSchema, isUuid, lengthOptions } from '@/features/practice/schemas'

const ID = '0b5c2c55-7f6b-4c38-9a8e-2b1a4c1f7d10'

describe('clampTimeSpent', () => {
  it('rounds and keeps sane values', () => {
    expect(clampTimeSpent(42.4)).toBe(42)
  })
  it('treats negative, NaN and missing as 0', () => {
    expect(clampTimeSpent(-5)).toBe(0)
    expect(clampTimeSpent(Number.NaN)).toBe(0)
    expect(clampTimeSpent(undefined)).toBe(0)
    expect(clampTimeSpent(Number.POSITIVE_INFINITY)).toBe(0)
  })
  it('caps at the per-question maximum', () => {
    expect(clampTimeSpent(10_000)).toBe(900)
  })
  it('never exceeds the real time since the attempt started', () => {
    expect(clampTimeSpent(600, { elapsedSinceStartSeconds: 30 })).toBe(30)
  })
})

describe('secondsBetween', () => {
  it('is never negative', () => {
    const now = new Date('2026-11-02T10:00:00Z')
    expect(secondsBetween('2026-11-02T09:59:00Z', now)).toBe(60)
    expect(secondsBetween('2026-11-02T10:05:00Z', now)).toBe(0)
  })
})

describe('StartPracticeSchema', () => {
  it('accepts each mode', () => {
    expect(StartPracticeSchema.safeParse({ mode: 'custom', subjectCode: 'math', count: 10 }).success).toBe(true)
    expect(StartPracticeSchema.safeParse({ mode: 'set', practiceSetId: ID }).success).toBe(true)
    expect(StartPracticeSchema.safeParse({ mode: 'retry', sourceAttemptId: ID }).success).toBe(true)
    expect(StartPracticeSchema.safeParse({ mode: 'bookmarks' }).success).toBe(true)
  })
  it('defaults difficulty to mixed', () => {
    const parsed = StartPracticeSchema.parse({ mode: 'custom', subjectCode: 'reading_writing', count: 5 })
    expect(parsed.mode === 'custom' && parsed.difficulty).toBe('mixed')
  })
  it('rejects too few questions, unknown subjects and bad ids', () => {
    expect(StartPracticeSchema.safeParse({ mode: 'custom', subjectCode: 'math', count: 4 }).success).toBe(false)
    expect(StartPracticeSchema.safeParse({ mode: 'custom', subjectCode: 'science', count: 10 }).success).toBe(false)
    expect(StartPracticeSchema.safeParse({ mode: 'retry', sourceAttemptId: 'nope' }).success).toBe(false)
    expect(StartPracticeSchema.safeParse({ mode: 'other' }).success).toBe(false)
  })
})

describe('PracticeAnswerSchema', () => {
  it('ignores client-sent correctness fields', () => {
    const parsed = PracticeAnswerSchema.parse({ attemptId: ID, questionId: ID, selectedOptionId: ID, isCorrect: true, timeSpentSeconds: 12 })
    expect('isCorrect' in parsed).toBe(false)
  })
  it('rejects overlong SPR responses and negative time', () => {
    expect(PracticeAnswerSchema.safeParse({ attemptId: ID, questionId: ID, responseText: '1234567890123' }).success).toBe(false)
    expect(PracticeAnswerSchema.safeParse({ attemptId: ID, questionId: ID, timeSpentSeconds: -1 }).success).toBe(false)
  })
})

describe('lengthOptions / isUuid', () => {
  it('offers lengths up to the platform maximum, including it', () => {
    expect(lengthOptions(30)).toEqual([5, 10, 15, 20, 30])
    expect(lengthOptions(12)).toEqual([5, 10, 12])
    expect(lengthOptions(2)).toEqual([5])
  })
  it('validates uuids', () => {
    expect(isUuid(ID)).toBe(true)
    expect(isUuid('../etc')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })
})
