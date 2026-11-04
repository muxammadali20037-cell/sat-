/**
 * Migration 0025: challenges are readable by the group only; nobody can write them from a client;
 * a student cannot flip their own (or anyone's) leaderboard opt-in directly.
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

describe('class challenges (0025)', () => {
  it('group-only reads, no client writes, opt-in default off and server-only', async () => {
    await tx(async (cl) => {
      const teacher = await createUser(cl)
      const a = await createUser(cl)
      const other = await createUser(cl)
      const ws = (await cl.query(`select public.workspace_create($1, 'WS', 'center', null, 'Asia/Tashkent') as id`, [teacher])).rows[0].id
      const g = (await cl.query(`insert into public.groups (workspace_id, name) values ($1, 'Group C') returning id`, [ws])).rows[0].id
      const g2 = (await cl.query(`insert into public.groups (workspace_id, name) values ($1, 'Group D') returning id`, [ws])).rows[0].id
      await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1,$2,'student','CHAAAAA2', now()+interval '1 day'), ($1,$3,'student','CHAAAAA3', now()+interval '1 day')`, [ws, g, g2])
      await cl.query(`select * from public.workspace_join($1, 'CHAAAAA2')`, [a])
      await cl.query(`select * from public.workspace_join($1, 'CHAAAAA3')`, [other])
      await cl.query(`insert into public.class_challenges (workspace_id, group_id, title, metric, mode, target, starts_on, ends_on) values ($1,$2,'Week goal','correct_answers','group',100, current_date, current_date + 6)`, [ws, g])
      expect((await cl.query(`select leaderboard_opt_in from public.workspace_members where user_id = $1`, [a])).rows[0].leaderboard_opt_in).toBe(false)

      await become(cl, a)
      expect((await cl.query('select title from public.class_challenges')).rowCount).toBe(1)
      expect(await expectError(cl, `update public.workspace_members set leaderboard_opt_in = true where user_id = $1`, [a])).toMatch(/permission denied/)
      expect(await expectError(cl, `insert into public.class_challenges (workspace_id, group_id, title, metric, mode, target, starts_on, ends_on) values ($1,$2,'x y','active_days','individual',3, current_date, current_date)`, [ws, g])).toMatch(/permission denied/)
      await become(cl, teacher)
      expect((await cl.query('select title from public.class_challenges')).rowCount).toBe(1)
      expect(await expectError(cl, `update public.class_challenges set target = 1`)).toMatch(/permission denied/)
      expect(await expectError(cl, `delete from public.class_challenges`)).toMatch(/permission denied/)
      await become(cl, other)
      expect((await cl.query('select title from public.class_challenges')).rowCount).toBe(0)
      await cl.query('reset role')
      expect(await expectError(cl, `insert into public.class_challenges (workspace_id, group_id, title, metric, mode, target, starts_on, ends_on) values ($1,$2,'Too long','correct_answers','group',5, current_date, current_date + 200)`, [ws, g])).toMatch(/check/)
    })
  })
})
