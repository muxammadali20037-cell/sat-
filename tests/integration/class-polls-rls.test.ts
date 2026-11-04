/**
 * Migration 0024: polls are readable by the group's staff and students only; the quiz key column
 * is not readable by any browser client; a student reads only their own answers; no client writes;
 * constraints keep quizzes and answers consistent.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connect, createUser, expectError, withIdentity } from './db'

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
  await cl.query('reset role')
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await cl.query('set local role authenticated')
}
const n = async (cl: Client, sql: string) => Number((await cl.query(sql)).rows[0].n)

async function world(cl: Client) {
  const teacher = await createUser(cl)
  const a = await createUser(cl)
  const b = await createUser(cl)
  const other = await createUser(cl)
  const ws = (await cl.query(`select public.workspace_create($1, 'WS', 'center', null, 'Asia/Tashkent') as id`, [teacher])).rows[0].id
  const g = (await cl.query(`insert into public.groups (workspace_id, name) values ($1, 'Group P') returning id`, [ws])).rows[0].id
  const g2 = (await cl.query(`insert into public.groups (workspace_id, name) values ($1, 'Group Q') returning id`, [ws])).rows[0].id
  await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1,$2,'student','PLAAAAA2', now()+interval '1 day'), ($1,$3,'student','PLAAAAA3', now()+interval '1 day')`, [ws, g, g2])
  for (const [u, code] of [[a, 'PLAAAAA2'], [b, 'PLAAAAA2'], [other, 'PLAAAAA3']]) await cl.query(`select * from public.workspace_join($1, $2)`, [u, code])
  const quiz = (await cl.query(`insert into public.class_polls (workspace_id, group_id, kind, question, options, correct_index) values ($1,$2,'quiz','2x=8?', array['2','4','8'], 1) returning id`, [ws, g])).rows[0].id
  await cl.query(`insert into public.class_poll_answers (workspace_id, poll_id, student_id, choice) values ($1,$2,$3,1), ($1,$2,$4,0)`, [ws, quiz, a, b])
  return { teacher, a, b, other, ws, g, g2, quiz }
}

describe('class polls (0024)', () => {
  it('group students and staff read the poll; another group does not', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      for (const who of [w.a, w.teacher]) {
        await become(cl, who)
        expect(await n(cl, 'select count(*) n from public.class_polls')).toBe(1)
      }
      await become(cl, w.other)
      expect(await n(cl, 'select count(*) n from public.class_polls')).toBe(0)
    })
  })
  it('the quiz key is not readable by any browser client, staff included', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      for (const who of [w.a, w.teacher]) {
        await become(cl, who)
        expect(await expectError(cl, 'select correct_index from public.class_polls')).toMatch(/permission denied/)
        expect(await expectError(cl, 'select * from public.class_polls')).toMatch(/permission denied/)
        expect((await cl.query('select question, options from public.class_polls')).rowCount).toBe(1)
      }
    })
  })
  it('a student sees only their own answer; staff see all; no client writes', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.a)
      expect((await cl.query('select choice from public.class_poll_answers')).rows.map((r) => r.choice)).toEqual([1])
      await become(cl, w.teacher)
      expect(await n(cl, 'select count(*) n from public.class_poll_answers')).toBe(2)
      for (const who of [w.a, w.teacher]) {
        await become(cl, who)
        expect(await expectError(cl, `insert into public.class_poll_answers (workspace_id, poll_id, student_id, choice) values ($1,$2,$3,2)`, [w.ws, w.quiz, w.other])).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.class_poll_answers set choice = 1`)).toMatch(/permission denied/)
        expect(await expectError(cl, `delete from public.class_poll_answers`)).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.class_polls set status = 'closed'`)).toMatch(/permission denied/)
      }
      await cl.query('reset role')
      await cl.query('set local role anon')
      expect(await expectError(cl, 'select id from public.class_polls')).toMatch(/permission denied/)
    })
  })
  it('constraints: quiz key in range, polls have no key, answers belong to the workspace', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      expect(await expectError(cl, `insert into public.class_polls (workspace_id, group_id, kind, question, options, correct_index) values ($1,$2,'quiz','q?', array['a','b'], 5)`, [w.ws, w.g])).toMatch(/check/)
      expect(await expectError(cl, `insert into public.class_polls (workspace_id, group_id, kind, question, options, correct_index) values ($1,$2,'poll','q?', array['a','b'], 0)`, [w.ws, w.g])).toMatch(/check/)
      expect(await expectError(cl, `insert into public.class_polls (workspace_id, group_id, kind, question, options) values ($1,$2,'poll','q?', array['a'])`, [w.ws, w.g])).toMatch(/check/)
      const stranger = await createUser(cl)
      expect(await expectError(cl, `insert into public.class_poll_answers (workspace_id, poll_id, student_id, choice) values ($1,$2,$3,0)`, [w.ws, w.quiz, stranger])).toMatch(/foreign key/)
    })
  })
})
