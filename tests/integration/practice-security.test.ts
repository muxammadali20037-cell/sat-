/**
 * Security floor for practice/diagnostic data (RLS, as the `authenticated` role):
 * students cannot read answer keys or explanations, cannot read another student's attempts or
 * answers, and cannot write attempts/answers/results themselves (server-only writes).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asUser, connect, createPublishedQuestion, createUser, expectError } from './db'

let c: Client
let alice: string
let bob: string
let editor: string
let questionId: string
let correctOptionId: string
let aliceAttempt: string
let aliceAq: string

beforeAll(async () => {
  c = await connect()
  // Fixtures are committed for this file and removed in afterAll.
  alice = await createUser(c, { fullName: 'Alice Student' })
  bob = await createUser(c, { fullName: 'Bob Student' })
  editor = await createUser(c, { role: 'CONTENT_EDITOR' })
  const q = await createPublishedQuestion(c, { reviewerId: editor })
  questionId = q.questionId
  correctOptionId = q.correctOptionId
  const a = await c.query(
    `insert into public.attempts (user_id, kind, practice_mode, total_questions) values ($1, 'practice', 'custom', 1) returning id`,
    [alice],
  )
  aliceAttempt = a.rows[0].id
  const aq = await c.query(`insert into public.attempt_questions (attempt_id, question_id, position) values ($1, $2, 1) returning id`, [
    aliceAttempt,
    questionId,
  ])
  aliceAq = aq.rows[0].id
  await c.query(
    `insert into public.attempt_answers (attempt_id, attempt_question_id, question_id, user_id, selected_option_id, is_correct, answered_at)
     values ($1, $2, $3, $4, $5, true, now())`,
    [aliceAttempt, aliceAq, questionId, alice, correctOptionId],
  )
})

afterAll(async () => {
  if (!c) return
  await c.query(`delete from public.attempts where user_id = any($1)`, [[alice, bob]])
  await c.query(`delete from public.questions where id = $1`, [questionId]).catch(() => undefined)
  await c.query(`delete from auth.users where id = any($1)`, [[alice, bob, editor]]).catch(() => undefined)
  await c.end()
})

describe('answer keys are never readable by students', () => {
  it('cannot read answer_options, even after answering the question', async () => {
    await asUser(c, alice, async (db) => {
      // The grant exists for staff policies; RLS must hide every row from students.
      const { rows } = await db.query(`select id, is_correct from public.answer_options where question_id = $1`, [questionId])
      expect(rows).toHaveLength(0)
    })
  })

  it('cannot read explanations, SPR keys or questions', async () => {
    await asUser(c, alice, async (db) => {
      for (const table of ['question_explanations', 'question_spr_answers']) {
        const { rows } = await db.query(`select * from public.${table} where question_id = $1`, [questionId])
        expect(rows, table).toHaveLength(0)
      }
      const { rows } = await db.query(`select id from public.questions where id = $1`, [questionId])
      expect(rows).toHaveLength(0)
    })
  })
})

describe('attempts are private to their owner', () => {
  it('owner reads own attempt and answer', async () => {
    await asUser(c, alice, async (db) => {
      expect((await db.query(`select id from public.attempts where id = $1`, [aliceAttempt])).rows).toHaveLength(1)
      expect((await db.query(`select id from public.attempt_answers where attempt_id = $1`, [aliceAttempt])).rows).toHaveLength(1)
    })
  })

  it("another student cannot read the attempt, its questions or answers", async () => {
    await asUser(c, bob, async (db) => {
      expect((await db.query(`select id from public.attempts where id = $1`, [aliceAttempt])).rows).toHaveLength(0)
      expect((await db.query(`select id from public.attempt_questions where attempt_id = $1`, [aliceAttempt])).rows).toHaveLength(0)
      expect((await db.query(`select id from public.attempt_answers where attempt_id = $1`, [aliceAttempt])).rows).toHaveLength(0)
      expect((await db.query(`select id from public.diagnostic_results where user_id = $1`, [alice])).rows).toHaveLength(0)
    })
  })
})

describe('attempt data is written only by the server', () => {
  it('students cannot insert or update attempts or answers', async () => {
    await asUser(c, alice, async (db) => {
      await expectError(db, `insert into public.attempts (user_id, kind, practice_mode) values ($1, 'practice', 'custom')`, [alice])
      await expectError(db, `update public.attempts set correct_count = 1 where id = $1`, [aliceAttempt])
      await expectError(db, `update public.attempt_answers set is_correct = true where attempt_id = $1`, [aliceAttempt])
      await expectError(
        db,
        `insert into public.diagnostic_results (attempt_id, user_id, domain_id, correct_count, total_count, accuracy, level)
         select $1, $2, id, 1, 1, 1, 'advanced' from public.domains limit 1`,
        [aliceAttempt, alice],
      )
    })
  })

  it('one answer per assigned question (first answer locks)', async () => {
    const msg = await c
      .query(
        `insert into public.attempt_answers (attempt_id, attempt_question_id, question_id, user_id, is_correct) values ($1, $2, $3, $4, false)`,
        [aliceAttempt, aliceAq, questionId, alice],
      )
      .then(() => 'inserted')
      .catch((err: Error) => err.message)
    expect(msg).toMatch(/duplicate key/)
  })
})

describe('bookmarks', () => {
  it("students cannot see or delete another student's bookmarks", async () => {
    const b = await c.query(`insert into public.bookmarks (user_id, question_id) values ($1, $2) returning id`, [alice, questionId])
    try {
      await asUser(c, bob, async (db) => {
        expect((await db.query(`select id from public.bookmarks where id = $1`, [b.rows[0].id])).rows).toHaveLength(0)
        const del = await db.query(`delete from public.bookmarks where id = $1`, [b.rows[0].id])
        expect(del.rowCount).toBe(0)
      })
    } finally {
      await c.query(`delete from public.bookmarks where id = $1`, [b.rows[0].id])
    }
  })
})
