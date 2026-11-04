/**
 * PHASE 4-C: poll/quiz inputs, counting, and role-shaped views — a student never sees counts or
 * the quiz key while a question is open.
 */
import { describe, expect, it } from 'vitest'
import { CreatePollSchema, staffView, studentView, tally, type PollRow } from '@/features/classroom/polls'
import { can } from '@/features/classroom/permissions'

const W = '11111111-1111-4111-8111-111111111111'
const G = '22222222-2222-4222-8222-222222222222'
const quiz = (status: 'open' | 'closed'): PollRow => ({
  id: 'p1',
  kind: 'quiz',
  question: '2x = 8. x = ?',
  options: ['2', '4', '8'],
  correct_index: 1,
  status,
  created_at: '2026-11-04T10:00:00Z',
  closed_at: status === 'closed' ? '2026-11-04T10:05:00Z' : null,
  session_id: null,
})

describe('poll inputs', () => {
  const base = { workspaceId: W, groupId: G, question: 'Which method?', options: ['A', 'B'] }
  it('a quiz needs a valid correct option; a poll has none', () => {
    expect(CreatePollSchema.safeParse({ ...base, kind: 'quiz', correctIndex: 1 }).success).toBe(true)
    expect(CreatePollSchema.safeParse({ ...base, kind: 'quiz' }).success).toBe(false)
    expect(CreatePollSchema.safeParse({ ...base, kind: 'quiz', correctIndex: 2 }).success).toBe(false)
    expect(CreatePollSchema.safeParse({ ...base, kind: 'poll', correctIndex: 0 }).success).toBe(false)
    expect(CreatePollSchema.safeParse({ ...base, kind: 'poll' }).success).toBe(true)
  })
  it('2–6 distinct, bounded options', () => {
    expect(CreatePollSchema.safeParse({ ...base, kind: 'poll', options: ['only'] }).success).toBe(false)
    expect(CreatePollSchema.safeParse({ ...base, kind: 'poll', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false)
    expect(CreatePollSchema.safeParse({ ...base, kind: 'poll', options: ['Same', 'same'] }).success).toBe(false)
    expect(CreatePollSchema.safeParse({ ...base, kind: 'poll', options: ['x'.repeat(201), 'b'] }).success).toBe(false)
  })
  it('only the group staff may run polls', () => {
    expect(can('teacher', 'poll.manage', { teachesGroup: true })).toBe(true)
    expect(can('teacher', 'poll.manage', { teachesGroup: false })).toBe(false)
    expect(can('student', 'poll.manage', { teachesGroup: true })).toBe(false)
  })
})

describe('poll views', () => {
  it('tally ignores invalid choices', () => {
    expect(tally(3, [0, 1, 1, 2, 7, -1])).toEqual([1, 2, 1])
  })
  it('an open quiz shows a student no counts and no key; a closed one shows both', () => {
    const open = studentView(quiz('open'), 0, [0, 1, 1])
    expect(open.counts).toBeNull()
    expect(open.correctIndex).toBeNull()
    expect(open.myChoice).toBe(0)
    expect(JSON.stringify(open)).not.toContain('correct_index')
    const closed = studentView(quiz('closed'), 0, [0, 1, 1])
    expect(closed.counts).toEqual([1, 2, 0])
    expect(closed.correctIndex).toBe(1)
  })
  it('staff see counts, the key, per-student answers and the correct rate', () => {
    const v = staffView(quiz('open'), [{ student_id: 'a', choice: 1 }, { student_id: 'b', choice: 0 }], [{ id: 'a', name: 'Ali' }, { id: 'b', name: 'Bek' }, { id: 'c', name: 'Cho' }])
    expect(v).toMatchObject({ answered: 2, students: 3, correctIndex: 1, correctRate: 0.5, counts: [1, 1, 0] })
    expect(v.byStudent.find((s) => s.studentId === 'c')?.choice).toBeNull()
  })
})
