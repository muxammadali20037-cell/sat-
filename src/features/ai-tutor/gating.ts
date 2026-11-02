/**
 * Who may ask the tutor about which question — pure decisions over "attempt facts" (one fact per
 * attempt that contains the question, for the requesting student only). Unit-tested.
 *
 * - explain: needs a SCORED answer (is_correct not null) and the question must not be in any
 *   in-progress diagnostic or mock exam.
 * - hint: needs the question in one of the student's practice attempts (encountered), and not in an
 *   in-progress timed attempt. The answer key is never used for hints.
 * - generate from a question: needs any encounter, and not in an in-progress timed attempt.
 */

export type AttemptKind = 'practice' | 'diagnostic' | 'mock_exam'

export type QuestionFact = {
  attemptKind: AttemptKind
  attemptStatus: string
  answered: boolean
  isCorrect: boolean | null
}

export type AccessReason = 'ok' | 'not_encountered' | 'not_answered' | 'in_timed_test'
export type AccessDecision = { allowed: boolean; reason: AccessReason }

export function isInProgressTimed(f: QuestionFact): boolean {
  return (f.attemptKind === 'diagnostic' || f.attemptKind === 'mock_exam') && f.attemptStatus === 'in_progress'
}

export function decideExplain(facts: QuestionFact[]): AccessDecision {
  if (facts.some(isInProgressTimed)) return { allowed: false, reason: 'in_timed_test' }
  if (facts.some((f) => f.isCorrect !== null)) return { allowed: true, reason: 'ok' }
  if (facts.length === 0) return { allowed: false, reason: 'not_encountered' }
  return { allowed: false, reason: 'not_answered' }
}

export function decideHint(facts: QuestionFact[]): AccessDecision {
  if (facts.some(isInProgressTimed)) return { allowed: false, reason: 'in_timed_test' }
  if (facts.some((f) => f.attemptKind === 'practice')) return { allowed: true, reason: 'ok' }
  return { allowed: false, reason: 'not_encountered' }
}

export function decideGenerateFromQuestion(facts: QuestionFact[]): AccessDecision {
  if (facts.some(isInProgressTimed)) return { allowed: false, reason: 'in_timed_test' }
  if (facts.length === 0) return { allowed: false, reason: 'not_encountered' }
  return { allowed: true, reason: 'ok' }
}

/** Combined view for the UI context card. */
export function contextAccess(facts: QuestionFact[]): { explain: boolean; hint: boolean; reason: AccessReason } {
  const explain = decideExplain(facts)
  const hint = decideHint(facts)
  const reason: AccessReason = explain.allowed || hint.allowed ? (explain.allowed ? 'ok' : 'not_answered') : explain.reason
  return { explain: explain.allowed, hint: hint.allowed, reason }
}

export const ACCESS_MESSAGES: Record<Exclude<AccessReason, 'ok'>, string> = {
  not_encountered: 'Answer this question in practice first, then ask the tutor about it.',
  not_answered: 'A full explanation is available after you answer this question. You can ask for hints now.',
  in_timed_test: 'Finish your test first — the tutor can explain this question afterwards.',
}
