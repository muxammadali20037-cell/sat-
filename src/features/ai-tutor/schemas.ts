import { z } from 'zod'
import { TutorResponseSchema, type TutorResponse } from '@/lib/ai/schemas'
import type { SubjectCode } from '@/types/questions'

/** Request bodies and client-safe payloads for the AI tutor. No server imports. */

export const MAX_STUDENT_MESSAGE = 2000

const id = z.guid()
const message = z.string().trim().min(1).max(MAX_STUDENT_MESSAGE)
export const HintLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)])
export type HintLevel = z.infer<typeof HintLevelSchema>

export const ChatBody = z.object({ sessionId: id.optional(), message })
export const ExplainBody = z.object({ questionId: id, sessionId: id.optional(), message: message.optional() })
export const HintBody = z.object({ questionId: id, sessionId: id.optional(), level: HintLevelSchema, message: message.optional() })
export const GenerateBody = z
  .object({ skillId: id.optional(), questionId: id.optional(), sessionId: id.optional() })
  .refine((b) => Boolean(b.skillId) !== Boolean(b.questionId), { message: 'Provide either skillId or questionId.' })
export const GenerateAnswerBody = z.object({ generatedId: id, selectedIndex: z.number().int().min(0).max(3) })

export type TutorMode = 'chat' | 'explain' | 'hint'
export type MessageMode = TutorMode | 'generate'
export type ProviderLabel = 'anthropic' | 'mock'

export type TutorMeta = {
  mode: TutorMode
  provider: ProviderLabel
  hintLevel?: HintLevel | null
  relatedSkillId?: string | null
  questionId?: string | null
}

/** Safe generated question (never includes the correct index). */
export type SafeGeneratedQuestion = {
  id: string
  stem: string
  passage: string | null
  options: string[]
  skillId: string | null
  skillName: string | null
  verified: boolean
}

export type GeneratedReveal = { selectedIndex: number; correctIndex: number; isCorrect: boolean; explanation: string }

const TutorMetaSchema = z.object({
  mode: z.enum(['chat', 'explain', 'hint']),
  provider: z.enum(['anthropic', 'mock']),
  hintLevel: HintLevelSchema.nullable().optional(),
  relatedSkillId: z.string().nullable().optional(),
  questionId: z.string().nullable().optional(),
})

/** Shape of ai_messages.structured for assistant rows (validated again when read). */
export const StoredStructuredSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tutor'), response: TutorResponseSchema, meta: TutorMetaSchema }),
  z.object({
    kind: z.literal('generated_practice'),
    generated: z.object({
      id: z.string(),
      stem: z.string(),
      passage: z.string().nullable(),
      options: z.array(z.string()),
      skillId: z.string().nullable(),
      skillName: z.string().nullable(),
      verified: z.boolean(),
    }),
    meta: z.object({ provider: z.enum(['anthropic', 'mock']), skillId: z.string().nullable() }),
  }),
])
export type StoredStructured = z.infer<typeof StoredStructuredSchema>
export type TutorStructured = { kind: 'tutor'; response: TutorResponse; meta: TutorMeta }

export type ChatMessageView = {
  id: string
  role: 'user' | 'assistant'
  mode: MessageMode
  content: string
  structured: StoredStructured | null
  questionId: string | null
  /** For user rows in hint mode (taken from the paired assistant row). */
  hintLevel: HintLevel | null
  createdAt: string
}

export type RelatedInfo = {
  skillId: string
  skillName: string
  domainId: string
  domainName: string
  subjectId: string
  subjectCode: SubjectCode
  lessons: { id: string; title: string }[]
} | null

export type UsageInfo = { used: number; limit: number | null }

export type TutorTurnResponse = {
  sessionId: string
  sessionTitle: string
  isNewSession: boolean
  userMessage: ChatMessageView
  assistantMessage: ChatMessageView
  related: RelatedInfo
  usage: UsageInfo
}

export type GenerateAnswerResponse = GeneratedReveal

export function practiceHref(related: NonNullable<RelatedInfo>): string {
  const p = new URLSearchParams({ subject: related.subjectCode, domain: related.domainId, skill: related.skillId })
  return `/dashboard/practice?${p.toString()}`
}
