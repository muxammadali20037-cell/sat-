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
    /** Timed drill: a server deadline at Digital SAT pace (see drillSeconds). */
    timed: z.boolean().default(false),
  }),
  z.object({ mode: z.literal('set'), practiceSetId: id }),
  z.object({ mode: z.literal('retry'), sourceAttemptId: id }),
  z.object({ mode: z.literal('bookmarks') }),
  /** Open mistakes from the notebook, optionally narrowed to a subject or skill. */
  z.object({ mode: z.literal('mistakes'), subjectCode: z.enum(['math', 'reading_writing']).optional(), skillId: id.optional() }),
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

/**
 * Digital SAT pace per question: Reading and Writing 64 min for 54 questions (≈71 s),
 * Math 70 min for 44 questions (≈95 s). A timed drill gets exactly that much time.
 */
export const SECONDS_PER_QUESTION = { reading_writing: 71, math: 95 } as const

export function drillSeconds(subject: 'math' | 'reading_writing', count: number): number {
  return Math.round(SECONDS_PER_QUESTION[subject] * count)
}

/** Answers that arrive this long after the deadline (network delay) are still accepted. */
export const DRILL_GRACE_SECONDS = 5
