/**
 * Migration 0018: flashcard review state is server-written and private to each student; the
 * student may set only their own country; practice attempts accept the new 'mistakes' mode.
 * SELECT, INSERT, UPDATE and DELETE are checked separately.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asAnon, connect, createUser, expectError, withIdentity } from './db'

let c: Client
beforeAll(async () => {
  c = await connect()
})
afterAll(async () => {
  await c?.end()
})

const tx = <T>(fn: (c: Client) => Promise<T>) =>
  withIdentity(c, { kind: 'service' }, async (cl) => {
    await cl.query('reset role')
    return fn(cl)
  })

async function become(cl: Client, userId: string) {
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await cl.query('set local role authenticated')
}

const addReview = (cl: Client, userId: string, key: string) =>
  cl.query(
    `insert into public.flashcard_reviews (user_id, card_key, due_at, last_reviewed_at, last_grade) values ($1, $2, now() + interval '1 day', now(), 'good')`,
    [userId, key],
  )

describe('flashcard_reviews', () => {
  it('SELECT: a student reads only their own review state', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      const b = await createUser(cl)
      await addReview(cl, a, 'math-formulas/slope')
      await addReview(cl, b, 'math-formulas/slope')
      await become(cl, a)
      const { rows } = await cl.query('select user_id from public.flashcard_reviews')
      expect(rows).toEqual([{ user_id: a }])
    })
    await asAnon(c, async (cl) => {
      expect(await expectError(cl, 'select * from public.flashcard_reviews')).toMatch(/permission denied/)
    })
  })

  it('INSERT, UPDATE, DELETE: students cannot write review state directly (the server schedules reviews)', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      await addReview(cl, a, 'rw-grammar/semicolon')
      await become(cl, a)
      expect(
        await expectError(
          cl,
          `insert into public.flashcard_reviews (user_id, card_key, due_at, last_reviewed_at, last_grade) values ($1, 'rw-grammar/colon', now(), now(), 'easy')`,
          [a],
        ),
      ).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.flashcard_reviews set interval_days = 3650 where user_id = $1`, [a])).toMatch(/permission denied/)
      expect(await expectError(cl, `delete from public.flashcard_reviews where user_id = $1`, [a])).toMatch(/permission denied/)
    })
  })

  it('validates keys, grades and ease', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      expect(await expectError(cl, `insert into public.flashcard_reviews (user_id, card_key, due_at, last_reviewed_at, last_grade) values ($1, 'Bad Key', now(), now(), 'good')`, [a])).toMatch(/check constraint/)
      expect(await expectError(cl, `insert into public.flashcard_reviews (user_id, card_key, due_at, last_reviewed_at, last_grade) values ($1, 'a/b', now(), now(), 'perfect')`, [a])).toMatch(/check constraint/)
      expect(await expectError(cl, `insert into public.flashcard_reviews (user_id, card_key, ease, due_at, last_reviewed_at, last_grade) values ($1, 'a/b', 9, now(), now(), 'good')`, [a])).toMatch(/check constraint/)
    })
  })
})

describe('profiles.country_code', () => {
  it('a student can set only their own country, and only a valid code', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      const b = await createUser(cl)
      await become(cl, a)
      await cl.query(`update public.profiles set country_code = 'UZ' where id = $1`, [a])
      const other = await cl.query(`update public.profiles set country_code = 'KZ' where id = $1`, [b])
      expect(other.rowCount).toBe(0)
      expect(await expectError(cl, `update public.profiles set country_code = 'uzb' where id = $1`, [a])).toMatch(/check constraint/)
      await cl.query('reset role')
      const { rows } = await cl.query(`select id, country_code from public.profiles where id in ($1, $2) order by id = $1 desc`, [a, b])
      expect(rows.map((r) => r.country_code)).toEqual(['UZ', null])
    })
  })
})

describe('attempts.practice_mode', () => {
  it("accepts 'mistakes' and still rejects unknown modes", async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      await cl.query(`insert into public.attempts (user_id, kind, practice_mode) values ($1, 'practice', 'mistakes')`, [a])
      expect(await expectError(cl, `insert into public.attempts (user_id, kind, practice_mode) values ($1, 'practice', 'random')`, [a])).toMatch(/check constraint/)
    })
  })
})
