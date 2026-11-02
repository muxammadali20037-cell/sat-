import { z } from 'zod'

/**
 * Output shapes requested from the model. Client-safe (zod only). Length limits are described to
 * the model and enforced server-side by clamping (features/*); shape is enforced by Zod.
 */

export const SCHEMA_NAMES = {
  tutor: 'tutor_response',
  generated: 'generated_practice',
  verification: 'practice_verification',
  narrative: 'study_plan_narrative',
} as const

export const TutorStepSchema = z.object({
  title: z.string().describe('Short step title, 2-8 words, no numbering.'),
  body: z.string().describe('1-3 sentences. Math in LaTeX between $...$ or $$...$$.'),
})

export const TutorResponseSchema = z.object({
  concept: z
    .string()
    .describe('The key idea in 1-4 sentences (at most 1500 characters). For chat questions this is the main answer.'),
  identified_mistake: z
    .string()
    .nullable()
    .describe("What went wrong in the student's answer or work, in 1-3 sentences. null when there is no mistake to discuss."),
  hint: z.string().nullable().describe('A hint that moves the student forward without giving the answer. null if not useful.'),
  step_by_step_explanation: z
    .array(TutorStepSchema)
    .describe('Ordered solution steps, at most 8. Empty array when steps are not appropriate (e.g. hint mode).'),
  final_answer: z.string().nullable().describe('The final answer, or null when it must not be given.'),
  related_skill: z
    .string()
    .nullable()
    .describe('Exactly one official skill name from the provided list, or null.'),
  next_exercise: z.string().nullable().describe('One sentence suggesting what to practise next, or null.'),
})
export type TutorResponse = z.infer<typeof TutorResponseSchema>
export type TutorStep = z.infer<typeof TutorStepSchema>

export const GeneratedPracticeSchema = z.object({
  stem: z.string().describe('The question text in English. Math in LaTeX between $...$.'),
  passage: z.string().nullable().describe('Short passage for Reading and Writing questions (25-150 words), otherwise null.'),
  options: z.array(z.string()).length(4).describe('Exactly 4 distinct answer choices, without "A)" prefixes.'),
  correct_index: z.number().int().min(0).max(3).describe('0-based index of the single correct option.'),
  explanation: z.string().describe('Why the correct option is right and why the main distractors are wrong.'),
})
export type GeneratedPractice = z.infer<typeof GeneratedPracticeSchema>

export const PracticeVerificationSchema = z.object({
  selected_index: z.number().int().min(0).max(3).describe('0-based index of the single best answer.'),
  ambiguous: z.boolean().describe('true if no option is correct, more than one is defensible, or the question is flawed.'),
  note: z.string().describe('One short sentence explaining the decision.'),
})
export type PracticeVerification = z.infer<typeof PracticeVerificationSchema>

export const StudyPlanNarrativeSchema = z.object({
  weekly_objectives: z.array(z.string()).describe('At most 6 short objectives (each under 120 characters).'),
  rationale: z.string().describe('Why the plan looks like this, under 1000 characters, plain text.'),
})
export type StudyPlanNarrative = z.infer<typeof StudyPlanNarrativeSchema>
