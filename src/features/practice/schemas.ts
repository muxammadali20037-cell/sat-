import { z } from 'zod'

/** Absolute bounds; the effective maximum per session comes from platform_settings. */
export const PRACTICE_MIN_QUESTIONS = 5
export const PRACTICE_HARD_MAX_QUESTIONS = 100
export const DEFAULT_MAX_QUESTIONS_PER_SESSION = 30

const id = z.guid()

export const StartPracticeSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('custom'),
    subjectCode: z.enum(['math', 'reading_writing']),
    domainId: id.optional(),
    skillId: id.optional(),
    difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
    count: z.number().int().min(PRACTICE_MIN_QUESTIONS).max(PRACTICE_HARD_MAX_QUESTIONS),
  }),
  z.object({ mode: z.literal('set'), practiceSetId: id }),
  z.object({ mode: z.literal('retry'), sourceAttemptId: id }),
  z.object({ mode: z.literal('bookmarks') }),
])
export type StartPracticeInput = z.infer<typeof StartPracticeSchema>

export const PracticeAnswerSchema = z.object({
  attemptId: id,
  questionId: id,
  selectedOptionId: id.nullish(),
  responseText: z.string().max(12).nullish(),
  timeSpentSeconds: z.number().min(0).max(86_400).default(0),
})
export type PracticeAnswerInput = z.infer<typeof PracticeAnswerSchema>

export const FinishPracticeSchema = z.object({ attemptId: id })

/** Session lengths offered in the configurator, bounded by the platform maximum. */
export function lengthOptions(maxPerSession: number): number[] {
  const max = Math.max(PRACTICE_MIN_QUESTIONS, Math.min(PRACTICE_HARD_MAX_QUESTIONS, Math.floor(maxPerSession)))
  const base = [5, 10, 15, 20, 30].filter((n) => n <= max)
  if (!base.includes(max)) base.push(max)
  return base
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** For route params and search params (Zod is used for bodies). */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
