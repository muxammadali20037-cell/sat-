import { z } from 'zod'

const id = z.guid()

export const StartDiagnosticSchema = z.object({ diagnosticTestId: id })

/**
 * Save or overwrite one diagnostic answer. Omitted fields are left unchanged; `null` clears.
 * At least one field must be present.
 */
export const DiagnosticAnswerSchema = z
  .object({
    attemptId: id,
    questionId: id,
    selectedOptionId: id.nullable().optional(),
    responseText: z.string().max(12).nullable().optional(),
    markedForReview: z.boolean().optional(),
  })
  .refine((v) => v.selectedOptionId !== undefined || v.responseText !== undefined || v.markedForReview !== undefined, {
    message: 'Nothing to save.',
  })
export type DiagnosticAnswerInput = z.infer<typeof DiagnosticAnswerSchema>

export const FinishDiagnosticSchema = z.object({ attemptId: id })

export const DEFAULT_ANSWER_GRACE_SECONDS = 5
