import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asService, asUser, connect, createPublishedQuestion, createUser, expectError } from './db'

/**
 * Mock exam security model at the database layer: students never read the exam's question list
 * (answer-key adjacent), never read another student's attempt modules/answers, and cannot write
 * attempt rows at all (the server writes them with the service role).
 */

let c: Client
let studentA: string
let studentB: string
let teacher: string
let editor: string
let examId: string
let draftExamId: string
let moduleId: string
let attemptB: string
let attemptModuleB: string
let questionId: string

beforeAll(async () => {
  c = await connect()
  studentA = await createUser(c, { fullName: 'Exam Student A' })
  studentB = await createUser(c, { fullName: 'Exam Student B' })
  teacher = await createUser(c, { role: 'TEACHER' })
  editor = await createUser(c, { role: 'CONTENT_EDITOR' })
  const q = await createPublishedQuestion(c, { reviewerId: editor })
  questionId = q.questionId

  const suffix = Date.now().toString(36)
  const exam = await c.query(
    `insert into public.mock_exams (slug, title, status, is_adaptive, is_full_length) values ($1, 'RLS exam', 'published', false, false) returning id`,
    [`rls-exam-${suffix}`],
  )
  examId = exam.rows[0].id
  const draft = await c.query(`insert into public.mock_exams (slug, title, status) values ($1, 'Draft exam', 'draft') returning id`, [`rls-draft-${suffix}`])
  draftExamId = draft.rows[0].id
  const mod = await c.query(
    `insert into public.mock_exam_modules (mock_exam_id, section, module_number, variant, duration_seconds)
     values ($1, 'math', 1, 'standard', 2100) returning id`,
    [examId],
  )
  moduleId = mod.rows[0].id
  await c.query(`insert into public.mock_exam_modules (mock_exam_id, section, module_number, variant, duration_seconds) values ($1, 'math', 1, 'standard', 2100)`, [
    draftExamId,
  ])
  await c.query(`insert into public.mock_exam_questions (module_id, question_id, position) values ($1, $2, 1)`, [moduleId, questionId])

  // Student B's in-progress attempt, as the server would write it.
  const att = await c.query(`insert into public.attempts (user_id, kind, mock_exam_id) values ($1, 'mock_exam', $2) returning id`, [studentB, examId])
  attemptB = att.rows[0].id
  const am = await c.query(
    `insert into public.attempt_modules (attempt_id, module_id, section, module_number, variant, status, sequence, duration_seconds, started_at, deadline_at)
     values ($1, $2, 'math', 1, 'standard', 'in_progress', 1, 2100, now(), now() + interval '35 minutes') returning id`,
    [attemptB, moduleId],
  )
  attemptModuleB = am.rows[0].id
  const aq = await c.query(`insert into public.attempt_questions (attempt_id, attempt_module_id, question_id, position) values ($1, $2, $3, 1) returning id`, [
    attemptB,
    attemptModuleB,
    questionId,
  ])
  await c.query(
    `insert into public.attempt_answers (attempt_id, attempt_question_id, question_id, user_id, selected_option_id, answered_at)
     values ($1, $2, $3, $4, $5, now())`,
    [attemptB, aq.rows[0].id, questionId, studentB, q.correctOptionId],
  )
})

afterAll(async () => {
  if (c) {
    await c.query(`delete from public.attempts where id = $1`, [attemptB])
    await c.query(`delete from public.mock_exams where id = any($1)`, [[examId, draftExamId]])
    await c.end()
  }
})

describe('mock exam content', () => {
  it('students see published exams and their modules, but not drafts', async () => {
    await asUser(c, studentA, async (db) => {
      const exams = await db.query(`select id from public.mock_exams where id = any($1)`, [[examId, draftExamId]])
      expect(exams.rows.map((r) => r.id)).toEqual([examId])
      const modules = await db.query(`select id from public.mock_exam_modules where mock_exam_id = any($1)`, [[examId, draftExamId]])
      expect(modules.rows.map((r) => r.id)).toEqual([moduleId])
    })
  })

  it('students cannot read the question list of any exam module', async () => {
    await asUser(c, studentA, async (db) => {
      const { rows } = await db.query(`select * from public.mock_exam_questions where module_id = $1`, [moduleId])
      expect(rows).toHaveLength(0)
    })
    await asUser(c, studentB, async (db) => {
      const { rows } = await db.query(`select * from public.mock_exam_questions where module_id = $1`, [moduleId])
      expect(rows).toHaveLength(0) // not even while taking the exam
    })
  })

  it('students cannot change exams, modules or module questions', async () => {
    await asUser(c, studentA, async (db) => {
      const upd = await db.query(`update public.mock_exams set status = 'draft' where id = $1`, [examId])
      expect(upd.rowCount).toBe(0)
      await expectError(db, `insert into public.mock_exam_questions (module_id, question_id, position) values ($1, $2, 2)`, [moduleId, questionId])
      await expectError(db, `insert into public.mock_exam_modules (mock_exam_id, section, module_number, variant, duration_seconds) values ($1, 'math', 2, 'standard', 60)`, [
        examId,
      ])
    })
  })

  it('staff read module questions; only content managers write them', async () => {
    await asUser(c, teacher, async (db) => {
      const { rows } = await db.query(`select question_id from public.mock_exam_questions where module_id = $1`, [moduleId])
      expect(rows.map((r) => r.question_id)).toEqual([questionId])
      await expectError(db, `insert into public.mock_exam_questions (module_id, question_id, position) values ($1, $2, 2)`, [moduleId, questionId])
    })
    await asUser(c, editor, async (db) => {
      const del = await db.query(`delete from public.mock_exam_questions where module_id = $1`, [moduleId])
      expect(del.rowCount).toBe(1) // rolled back by asUser
    })
  })
})

describe('attempt isolation', () => {
  it("a student cannot read another student's attempt, modules, questions or answers", async () => {
    await asUser(c, studentA, async (db) => {
      expect((await db.query(`select id from public.attempts where id = $1`, [attemptB])).rows).toHaveLength(0)
      expect((await db.query(`select id from public.attempt_modules where attempt_id = $1`, [attemptB])).rows).toHaveLength(0)
      expect((await db.query(`select id from public.attempt_questions where attempt_id = $1`, [attemptB])).rows).toHaveLength(0)
      expect((await db.query(`select id from public.attempt_answers where attempt_id = $1`, [attemptB])).rows).toHaveLength(0)
    })
  })

  it('the owner reads their own module state, with is_correct still NULL mid-exam', async () => {
    await asUser(c, studentB, async (db) => {
      const mods = await db.query(`select status, correct_count from public.attempt_modules where attempt_id = $1`, [attemptB])
      expect(mods.rows).toEqual([{ status: 'in_progress', correct_count: null }])
      const ans = await db.query(`select is_correct from public.attempt_answers where attempt_id = $1`, [attemptB])
      expect(ans.rows).toEqual([{ is_correct: null }])
    })
  })

  it('students cannot write attempts, modules or answers directly (server only)', async () => {
    await asUser(c, studentB, async (db) => {
      await expectError(db, `update public.attempt_modules set deadline_at = now() + interval '5 hours' where id = $1`, [attemptModuleB])
      await expectError(db, `update public.attempt_answers set is_correct = true where attempt_id = $1`, [attemptB])
      await expectError(db, `insert into public.attempts (user_id, kind, mock_exam_id) values ($1, 'mock_exam', $2)`, [studentB, examId])
    })
  })

  it('teachers (student viewers) can read attempts; the service role can write them', async () => {
    await asUser(c, teacher, async (db) => {
      expect((await db.query(`select id from public.attempt_modules where attempt_id = $1`, [attemptB])).rows).toHaveLength(1)
    })
    await asService(c, async (db) => {
      const upd = await db.query(`update public.attempt_modules set status = 'submitted', submitted_at = now() where id = $1 and status = 'in_progress'`, [
        attemptModuleB,
      ])
      expect(upd.rowCount).toBe(1)
    })
  })

  it('allows only one in-progress attempt per student per exam', async () => {
    await asService(c, async (db) => {
      const msg = await expectError(db, `insert into public.attempts (user_id, kind, mock_exam_id) values ($1, 'mock_exam', $2)`, [studentB, examId])
      expect(msg).toMatch(/attempts_one_active_mock_idx/)
    })
  })
})
