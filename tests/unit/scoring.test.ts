import { describe, expect, it } from 'vitest'
import {
  estimateSectionScore,
  isSprCorrect,
  levelFromAccuracy,
  parseSprResponse,
  routeSecondModule,
  scoreAnswer,
} from '@/lib/scoring'

describe('parseSprResponse', () => {
  it('accepts integers, decimals and fractions within the length limit', () => {
    expect(parseSprResponse('12')).toEqual({ ok: true, normalized: '12', value: 12 })
    expect(parseSprResponse('.75')).toMatchObject({ ok: true, value: 0.75 })
    expect(parseSprResponse('3/4')).toMatchObject({ ok: true, value: 0.75 })
    expect(parseSprResponse('-3/4')).toMatchObject({ ok: true, value: -0.75 })
    expect(parseSprResponse('  2.5 ')).toMatchObject({ ok: true, normalized: '2.5' })
    expect(parseSprResponse('5.')).toMatchObject({ ok: true, value: 5 })
  })

  it('normalizes unicode minus signs', () => {
    expect(parseSprResponse('−7')).toMatchObject({ ok: true, normalized: '-7', value: -7 })
  })

  it('enforces 5 characters (6 with a leading minus)', () => {
    expect(parseSprResponse('12345')).toMatchObject({ ok: true })
    expect(parseSprResponse('123456')).toEqual({ ok: false, reason: 'too_long' })
    expect(parseSprResponse('-12345')).toMatchObject({ ok: true })
    expect(parseSprResponse('-123456')).toEqual({ ok: false, reason: 'too_long' })
    expect(parseSprResponse('.66666')).toEqual({ ok: false, reason: 'too_long' })
  })

  it('rejects mixed numbers, symbols, units and zero denominators', () => {
    expect(parseSprResponse('1 1/2')).toEqual({ ok: false, reason: 'mixed_number' })
    expect(parseSprResponse('$5')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseSprResponse('5cm')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseSprResponse('1,000')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseSprResponse('3/0')).toEqual({ ok: false, reason: 'division_by_zero' })
    expect(parseSprResponse('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseSprResponse(null)).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('isSprCorrect', () => {
  it('matches equivalent forms numerically', () => {
    expect(isSprCorrect('0.75', ['3/4'])).toBe(true)
    expect(isSprCorrect('.75', ['3/4'])).toBe(true)
    expect(isSprCorrect('6/8', ['3/4'])).toBe(true)
    expect(isSprCorrect('-.5', ['-1/2'])).toBe(true)
  })

  it('rejects wrong or invalid responses', () => {
    expect(isSprCorrect('0.7', ['3/4'])).toBe(false)
    expect(isSprCorrect('1 1/2', ['3/2'])).toBe(false)
    expect(isSprCorrect('', ['0'])).toBe(false)
  })

  it('accepts any of several accepted answers (truncated repeating decimals)', () => {
    const accepted = ['2/3', '.6666', '.6667', '0.666', '0.667']
    expect(isSprCorrect('.6667', accepted)).toBe(true)
    expect(isSprCorrect('0.667', accepted)).toBe(true)
    expect(isSprCorrect('2/3', accepted)).toBe(true)
    expect(isSprCorrect('.67', accepted)).toBe(false)
  })
})

describe('scoreAnswer', () => {
  it('scores multiple choice by option id only', () => {
    const key = { type: 'multiple_choice' as const, correctOptionId: 'b' }
    expect(scoreAnswer(key, { selectedOptionId: 'b' })).toBe(true)
    expect(scoreAnswer(key, { selectedOptionId: 'a' })).toBe(false)
    expect(scoreAnswer(key, { selectedOptionId: null })).toBe(false)
    expect(scoreAnswer(key, { responseText: 'b' })).toBe(false)
  })

  it('scores student-produced responses', () => {
    const key = { type: 'student_produced_response' as const, acceptedAnswers: ['8'] }
    expect(scoreAnswer(key, { responseText: '8' })).toBe(true)
    expect(scoreAnswer(key, { responseText: '8.0' })).toBe(true)
    expect(scoreAnswer(key, { responseText: '16/2' })).toBe(true)
    expect(scoreAnswer(key, { responseText: '7' })).toBe(false)
  })
})

describe('levels, routing and estimates', () => {
  it('maps accuracy to level bands at the documented boundaries', () => {
    expect(levelFromAccuracy(0)).toBe('foundation')
    expect(levelFromAccuracy(0.39)).toBe('foundation')
    expect(levelFromAccuracy(0.4)).toBe('developing')
    expect(levelFromAccuracy(0.6)).toBe('proficient')
    expect(levelFromAccuracy(0.8)).toBe('advanced')
    expect(levelFromAccuracy(1)).toBe('advanced')
  })

  it('routes to the harder module at or above the threshold', () => {
    expect(routeSecondModule(17, 27, 0.6)).toBe('harder') // 0.63
    expect(routeSecondModule(16, 27, 0.6)).toBe('easier') // 0.59
    expect(routeSecondModule(12, 20, 0.6)).toBe('harder') // exactly 0.6
    expect(routeSecondModule(0, 0, 0.6)).toBe('easier')
  })

  it('follows the published estimate formula', () => {
    // harder: 200 + 600 * avg(1, 1) = 800
    expect(estimateSectionScore({ route: 'harder', module1: { correct: 27, total: 27 }, module2: { correct: 27, total: 27 } })).toEqual({
      point: 800,
      low: 760,
      high: 800,
    })
    // harder: 200 + 600 * avg(0.8, 0.5) = 590
    expect(estimateSectionScore({ route: 'harder', module1: { correct: 8, total: 10 }, module2: { correct: 5, total: 10 } }).point).toBe(590)
    // easier route is capped at 620
    expect(estimateSectionScore({ route: 'easier', module1: { correct: 10, total: 10 }, module2: { correct: 10, total: 10 } }).point).toBe(620)
    // standard: overall accuracy 50% → 500
    expect(estimateSectionScore({ route: 'standard', module1: { correct: 5, total: 10 }, module2: { correct: 5, total: 10 } }).point).toBe(500)
    // floor
    expect(estimateSectionScore({ route: 'easier', module1: { correct: 0, total: 10 }, module2: { correct: 0, total: 10 } })).toEqual({
      point: 200,
      low: 200,
      high: 240,
    })
  })
})
