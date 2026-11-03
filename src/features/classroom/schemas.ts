import { z } from 'zod'

/** Classroom input validation (every server action parses its input with these). */

const id = z.guid()
const name = z.string().trim().min(2).max(80)

export const CreateWorkspaceSchema = z.object({ name, kind: z.enum(['individual', 'center']) })

export const CreateGroupSchema = z.object({
  workspaceId: id,
  name,
  subject: z.string().trim().max(60).default(''),
})

export const GroupRefSchema = z.object({ workspaceId: id, groupId: id })

export const CreateInvitationSchema = z.object({
  workspaceId: id,
  groupId: id.nullable(),
  role: z.enum(['admin', 'teacher', 'assistant', 'student']),
  days: z.number().int().min(1).max(60),
  maxUses: z.number().int().min(1).max(1000).nullable(),
})

export const RevokeInvitationSchema = z.object({ workspaceId: id, invitationId: id })
export const RemoveStudentSchema = z.object({ workspaceId: id, groupId: id, studentId: id })
export const RemoveMemberSchema = z.object({ workspaceId: id, userId: id })

export const PracticeConfigSchema = z.object({
  subjectCode: z.enum(['math', 'reading_writing']),
  domainId: id.nullable().default(null),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  count: z.number().int().min(5).max(50),
  timed: z.boolean().default(false),
})
export type PracticeConfig = z.infer<typeof PracticeConfigSchema>

export const CreateAssignmentSchema = z
  .object({
    workspaceId: id,
    groupId: id,
    title: z.string().trim().min(2).max(120),
    instructions: z.string().trim().max(5000).default(''),
    kind: z.enum(['practice', 'mock_exam', 'text']),
    practice: PracticeConfigSchema.nullable().default(null),
    mockExamId: id.nullable().default(null),
    dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
    points: z.number().int().min(1).max(1000).nullable().default(null),
    /** Personal assignment: one student of the group (null = the whole group). */
    assigneeId: id.nullable().default(null),
  })
  .refine((v) => v.kind !== 'practice' || v.practice !== null, { path: ['practice'], message: 'required' })
  .refine((v) => v.kind !== 'mock_exam' || v.mockExamId !== null, { path: ['mockExamId'], message: 'required' })
export type CreateAssignmentInput = z.input<typeof CreateAssignmentSchema>

export const AssignmentRefSchema = z.object({ workspaceId: id, assignmentId: id })

export const GradeSchema = z.object({
  workspaceId: id,
  assignmentId: id,
  studentId: id,
  score: z.number().min(0).max(1000),
  feedback: z.string().trim().max(5000).default(''),
})

export const JoinSchema = z.object({ code: z.string().max(20) })
export const SharingSchema = z.object({ workspaceId: id, enabled: z.boolean() })
export const StartAssignmentSchema = z.object({ assignmentId: id })
export const SubmitTextSchema = z.object({ assignmentId: id, text: z.string().trim().min(1).max(10000) })
