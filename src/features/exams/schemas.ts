import { z } from 'zod'

/** Shared by route handlers (server) and forms (client). */

export const StartExamSchema = z.object({ mockExamId: z.guid() })

export const ModuleActionSchema = z.object({ attemptId: z.guid(), attemptModuleId: z.guid() })

export const SaveAnswerSchema = z.object({
  attemptId: z.guid(),
  attemptQuestionId: z.guid(),
  selectedOptionId: z.guid().nullable().default(null),
  responseText: z
    .string()
    .max(12)
    .nullable()
    .default(null)
    .transform((v) => (v === null || v.trim() === '' ? null : v.trim())),
  markedForReview: z.boolean().default(false),
  timeSpentSeconds: z.number().int().min(0).max(7200).default(0),
})
export type SaveAnswerInput = z.infer<typeof SaveAnswerSchema>

export const AttemptParamsSchema = z.object({ attemptId: z.guid() })

// ---------------------------------------------------------------------------
// Admin builder
// ---------------------------------------------------------------------------

const slug = z
  .string()
  .trim()
  .min(3, 'At least 3 characters.')
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single hyphens only.')

export const ExamSettingsSchema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters.').max(160),
  slug,
  description: z.string().trim().max(2000).default(''),
  routingThreshold: z.coerce.number().min(0.05, 'Between 5% and 95%.').max(0.95, 'Between 5% and 95%.'),
  breakMinutes: z.coerce.number().int().min(0).max(30),
  isFullLength: z.boolean(),
})
export type ExamSettingsInput = z.infer<typeof ExamSettingsSchema>

export const CreateExamSchema = ExamSettingsSchema.extend({
  isAdaptive: z.boolean(),
  rwModuleMinutes: z.coerce.number().int().min(1).max(120),
  mathModuleMinutes: z.coerce.number().int().min(1).max(120),
})
export type CreateExamInput = z.infer<typeof CreateExamSchema>

export const ModuleDurationSchema = z.object({ moduleId: z.guid(), minutes: z.coerce.number().int().min(1).max(120) })

export const ModuleQuestionSchema = z.object({ moduleId: z.guid(), questionId: z.guid() })
export const ModuleEntrySchema = z.object({ moduleId: z.guid(), entryId: z.guid() })
export const MoveEntrySchema = ModuleEntrySchema.extend({ direction: z.enum(['up', 'down']) })

export const AutoFillSchema = z.object({
  moduleId: z.guid(),
  count: z.coerce.number().int().min(1).max(60),
  mode: z.enum(['append', 'replace']),
})

export const AutoFillExamSchema = z.object({
  examId: z.guid(),
  count: z.coerce.number().int().min(1).max(60).default(10),
})

export const QuestionSearchSchema = z.object({
  moduleId: z.guid(),
  q: z.string().trim().max(120).default(''),
  domainId: z.guid().optional().or(z.literal('').transform(() => undefined)),
  skillId: z.guid().optional().or(z.literal('').transform(() => undefined)),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().or(z.literal('').transform(() => undefined)),
  page: z.coerce.number().int().min(1).max(500).default(1),
})
export type QuestionSearchInput = z.input<typeof QuestionSearchSchema>

export const ExamStatusSchema = z.object({ examId: z.guid(), status: z.enum(['draft', 'published', 'archived']) })
