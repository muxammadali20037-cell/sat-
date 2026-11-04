/**
 * Class polls and quick quizzes (pure, client-safe, unit-tested). The quiz key never leaves the
 * server while a quiz is open; students see results and the key only after the teacher closes it.
 */
import { z } from 'zod'

const id = z.guid()

export const CreatePollSchema = z
  .object({
    workspaceId: id,
    groupId: id,
    sessionId: id.nullable().default(null),
    kind: z.enum(['poll', 'quiz']),
    question: z.string().trim().min(2).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0).max(5).nullable().default(null),
  })
  .refine((v) => (v.kind === 'quiz' ? v.correctIndex !== null && v.correctIndex < v.options.length : v.correctIndex === null), {
    path: ['correctIndex'],
    message: 'quiz needs a correct option; a poll has none',
  })
  .refine((v) => new Set(v.options.map((o) => o.toLowerCase())).size === v.options.length, { path: ['options'], message: 'duplicate' })
export type CreatePollInput = z.input<typeof CreatePollSchema>

export const PollRefSchema = z.object({ pollId: id })
export const AnswerPollSchema = z.object({ pollId: id, choice: z.number().int().min(0).max(5) })

export type PollRow = {
  id: string
  kind: 'poll' | 'quiz'
  question: string
  options: string[]
  correct_index: number | null
  status: 'open' | 'closed'
  created_at: string
  closed_at: string | null
  session_id: string | null
}

/** Answers per option (only valid choices are counted). */
export function tally(optionCount: number, choices: number[]): number[] {
  const counts = Array.from({ length: optionCount }, () => 0)
  for (const c of choices) if (Number.isInteger(c) && c >= 0 && c < optionCount) counts[c]! += 1
  return counts
}

export type StudentPollView = {
  id: string
  kind: 'poll' | 'quiz'
  question: string
  options: string[]
  status: 'open' | 'closed'
  myChoice: number | null
  /** Only once the poll is closed. */
  counts: number[] | null
  /** Quiz key, only once the quiz is closed. */
  correctIndex: number | null
  createdAt: string
}

/** What a student may see: no counts and no quiz key while the poll is open. */
export function studentView(p: PollRow, myChoice: number | null, choices: number[]): StudentPollView {
  const closed = p.status === 'closed'
  return {
    id: p.id,
    kind: p.kind,
    question: p.question,
    options: p.options,
    status: p.status,
    myChoice,
    counts: closed ? tally(p.options.length, choices) : null,
    correctIndex: closed && p.kind === 'quiz' ? p.correct_index : null,
    createdAt: p.created_at,
  }
}

export type StaffPollView = StudentPollView & {
  answered: number
  students: number
  /** Quiz only: share of answers that were correct. */
  correctRate: number | null
  byStudent: Array<{ studentId: string; name: string; choice: number | null }>
}

export function staffView(p: PollRow, answers: Array<{ student_id: string; choice: number }>, roster: Array<{ id: string; name: string }>): StaffPollView {
  const choices = answers.map((a) => a.choice)
  const byId = new Map(answers.map((a) => [a.student_id, a.choice]))
  const correct = p.kind === 'quiz' && p.correct_index !== null ? choices.filter((c) => c === p.correct_index).length : 0
  return {
    id: p.id,
    kind: p.kind,
    question: p.question,
    options: p.options,
    status: p.status,
    myChoice: null,
    counts: tally(p.options.length, choices),
    correctIndex: p.correct_index,
    createdAt: p.created_at,
    answered: answers.length,
    students: roster.length,
    correctRate: p.kind === 'quiz' && answers.length > 0 ? correct / answers.length : null,
    byStudent: roster.map((s) => ({ studentId: s.id, name: s.name, choice: byId.get(s.id) ?? null })),
  }
}
