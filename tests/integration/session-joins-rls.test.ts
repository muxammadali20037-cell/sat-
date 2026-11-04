/**
 * Migration 0023 (live lesson joins): a user reads their own join rows, the group's staff read the
 * lesson's rows, nobody else reads anything, and clients never write.
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

describe('session_joins (0023)', () => {
  it('own rows for students, all rows for the group staff, nothing for others; no client writes', async () => {
    await tx(async (cl) => {
      const teacher = await createUser(cl)
      const outsider = await createUser(cl)
      const a = await createUser(cl)
      const b = await createUser(cl)
      const ws = (await cl.query(`select public.workspace_create($1, 'WS', 'center', null, 'Asia/Tashkent') as id`, [teacher])).rows[0].id
      const g = (await cl.query(`insert into public.groups (workspace_id, name) values ($1, 'Group J') returning id`, [ws])).rows[0].id
      await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1,$2,'student','JNAAAAA2', now()+interval '1 day')`, [ws, g])
      for (const u of [a, b]) await cl.query(`select * from public.workspace_join($1, 'JNAAAAA2')`, [u])
      const s = (await cl.query(`insert into public.class_sessions (workspace_id, group_id, title, starts_at, duration_minutes) values ($1,$2,'L1', now(), 60) returning id`, [ws, g])).rows[0].id
      await cl.query(`insert into public.session_joins (workspace_id, session_id, user_id) values ($1,$2,$3), ($1,$2,$4), ($1,$2,$5)`, [ws, s, a, b, teacher])

      await become(cl, a)
      expect(await n(cl, 'select count(*) n from public.session_joins')).toBe(1)
      await become(cl, teacher)
      expect(await n(cl, 'select count(*) n from public.session_joins')).toBe(3)
      await become(cl, outsider)
      expect(await n(cl, 'select count(*) n from public.session_joins')).toBe(0)
      for (const who of [a, teacher]) {
        await become(cl, who)
        expect(await expectError(cl, `insert into public.session_joins (workspace_id, session_id, user_id) values ($1,$2,$3)`, [ws, s, outsider])).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.session_joins set join_count = 99`)).toMatch(/permission denied/)
        expect(await expectError(cl, `delete from public.session_joins`)).toMatch(/permission denied/)
      }
      await cl.query('reset role')
      await cl.query('set local role anon')
      expect(await expectError(cl, 'select 1 from public.session_joins')).toMatch(/permission denied/)
    })
  })
})
