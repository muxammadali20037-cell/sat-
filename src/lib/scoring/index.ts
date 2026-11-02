/**
 * Answer scoring — pure functions, unit-tested (tests/unit/scoring.test.ts).
 * Server-only in practice (keys never reach the browser), but has no server dependencies.
 */

export type AnswerKey =
  | { type: 'multiple_choice'; correctOptionId: string }
  | { type: 'student_produced_response'; acceptedAnswers: string[] }

export type SubmittedAnswer = { selectedOptionId?: string | null; responseText?: string | null }

export type SprParseResult =
  | { ok: true; normalized: string; value: number }
  | { ok: false; reason: 'empty' | 'too_long' | 'invalid' | 'mixed_number' | 'division_by_zero' }

/**
 * Normalize and validate a Digital SAT student-produced response.
 * Rules: up to 5 characters for positive answers, 6 including a leading minus sign; integers,
 * decimals (leading "." allowed) and fractions; no mixed numbers, no commas, no units, no symbols.
 */
export function parseSprResponse(raw: string | null | undefined): SprParseResult {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' }
  const normalized = raw
    .trim()
    .replace(/[−‒–—]/g, '-') // unicode minus/dashes → ASCII hyphen-minus
    .replace(/\s+/g, ' ')
  if (normalized === '') return { ok: false, reason: 'empty' }
  if (/^-?\d+\s+\d+\/\d+$/.test(normalized)) return { ok: false, reason: 'mixed_number' }
  const compact = normalized.replace(/\s/g, '')
  const maxLength = compact.startsWith('-') ? 6 : 5
  if (compact.length > maxLength) return { ok: false, reason: 'too_long' }
  const match = /^(-)?(?:(\d+)\/(\d+)|(\d+(?:\.\d*)?|\.\d+))$/.exec(compact)
  if (!match) return { ok: false, reason: 'invalid' }
  const sign = match[1] ? -1 : 1
  let value: number
  if (match[2] !== undefined && match[3] !== undefined) {
    const denominator = Number(match[3])
    if (denominator === 0) return { ok: false, reason: 'division_by_zero' }
    value = (sign * Number(match[2])) / denominator
  } else {
    value = sign * Number(match[4])
  }
  if (!Number.isFinite(value)) return { ok: false, reason: 'invalid' }
  return { ok: true, normalized: compact, value }
}

const EPSILON = 1e-9

/** True when `response` matches any accepted answer textually or numerically. */
export function isSprCorrect(response: string | null | undefined, acceptedAnswers: string[]): boolean {
  const parsed = parseSprResponse(response)
  if (!parsed.ok) return false
  return acceptedAnswers.some((accepted) => {
    if (accepted.trim() === parsed.normalized) return true
    const acc = parseSprResponse(accepted)
    return acc.ok && Math.abs(acc.value - parsed.value) < EPSILON
  })
}

export function scoreAnswer(key: AnswerKey, answer: SubmittedAnswer): boolean {
  if (key.type === 'multiple_choice') {
    return !!answer.selectedOptionId && answer.selectedOptionId === key.correctOptionId
  }
  return isSprCorrect(answer.responseText, key.acceptedAnswers)
}

// ---------------------------------------------------------------------------
// Levels and estimates (SAT MASTER internal — never presented as official scores)
// ---------------------------------------------------------------------------

export type LevelBand = 'foundation' | 'developing' | 'proficient' | 'advanced'

export function levelFromAccuracy(accuracy: number): LevelBand {
  if (accuracy >= 0.8) return 'advanced'
  if (accuracy >= 0.6) return 'proficient'
  if (accuracy >= 0.4) return 'developing'
  return 'foundation'
}

export type ModuleRoute = 'harder' | 'easier' | 'standard'

/** Module-2 routing rule (SAT MASTER's own, not College Board's). */
export function routeSecondModule(module1Correct: number, module1Total: number, threshold: number): Exclude<ModuleRoute, 'standard'> {
  if (module1Total <= 0) return 'easier'
  return module1Correct / module1Total >= threshold ? 'harder' : 'easier'
}

const roundTo10 = (n: number) => Math.round(n / 10) * 10
const clampScore = (n: number) => Math.min(800, Math.max(200, n))

/**
 * Unofficial section estimate (docs/SYSTEM_ARCHITECTURE.md §9):
 *   harder:   200 + 600 × (a1 + a2) / 2
 *   easier:   200 + 420 × (a1 + a2) / 2   (ceiling 620)
 *   standard: 200 + 600 × overall accuracy
 * Returned as a ±40 range, rounded to 10.
 */
export function estimateSectionScore(input: {
  route: ModuleRoute
  module1: { correct: number; total: number }
  module2: { correct: number; total: number }
}): { point: number; low: number; high: number } {
  const a1 = input.module1.total > 0 ? input.module1.correct / input.module1.total : 0
  const a2 = input.module2.total > 0 ? input.module2.correct / input.module2.total : 0
  let point: number
  if (input.route === 'standard') {
    const total = input.module1.total + input.module2.total
    const overall = total > 0 ? (input.module1.correct + input.module2.correct) / total : 0
    point = 200 + 600 * overall
  } else if (input.route === 'harder') {
    point = 200 + 600 * ((a1 + a2) / 2)
  } else {
    point = Math.min(620, 200 + 420 * ((a1 + a2) / 2))
  }
  const p = clampScore(roundTo10(point))
  return { point: p, low: clampScore(p - 40), high: clampScore(p + 40) }
}
