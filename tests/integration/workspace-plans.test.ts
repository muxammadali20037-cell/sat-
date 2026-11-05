/**
 * Migration 0026: without plans nothing is limited; the default plan applies to workspaces without
 * an assigned plan; an assigned plan overrides it until it expires; workspace_join refuses a new
 * student at the limit (staff and returning members of other roles are not counted); clients can
 * read active plans but never write them or call the functions.
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
const plan = async (cl: Client, ws: string) => (await cl.query('select code from public.workspace_effective_plan($1)', [ws])).rows[0]?.code ?? null

async function setup(cl: Client) {
  const teacher = await createUser(cl)
  const ws = (await cl.query(`select public.workspace_create($1, 'WS', 'center', null, 'Asia/Tashkent') as id`, [teacher])).rows[0].id
  const g = (await cl.query(`insert into public.groups (workspace_id, name) values ($1, 'Group L') returning id`, [ws])).rows[0].id
  await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1,$2,'student','LMAAAAA2', now()+interval '1 day')`, [ws, g])
  await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1,null,'teacher','LMAAAAA3', now()+interval '1 day')`, [ws])
  return { teacher, ws, g }
}

describe('workspace plans (0026)', () => {
  it('no plans: no limits and no effective plan', async () => {
    await tx(async (cl) => {
      const { ws } = await setup(cl)
      expect(await plan(cl, ws)).toBeNull()
      for (let i = 0; i < 3; i++) await cl.query(`select * from public.workspace_join($1, 'LMAAAAA2')`, [await createUser(cl)])
      expect((await cl.query(`select count(*)::int n from public.workspace_members where workspace_id=$1 and role='student'`, [ws])).rows[0].n).toBe(3)
    })
  })

  it('default plan limits students; an assigned plan overrides it until it expires', async () => {
    await tx(async (cl) => {
      const { ws } = await setup(cl)
      await cl.query(`insert into public.workspace_plans (code, name, max_students, max_groups, is_default) values ('free_t', 'Free', 2, 1, true), ('pro_t', 'Pro', 3, null, false)`)
      expect(await plan(cl, ws)).toBe('free_t')
      const [a, b, x, y] = [await createUser(cl), await createUser(cl), await createUser(cl), await createUser(cl)]
      await cl.query(`select * from public.workspace_join($1, 'LMAAAAA2')`, [a])
      await cl.query(`select * from public.workspace_join($1, 'LMAAAAA2')`, [b])
      expect(await expectError(cl, `select * from public.workspace_join($1, 'LMAAAAA2')`, [x])).toMatch(/student limit reached/)
      // Staff are not counted against the student limit.
      await cl.query(`select * from public.workspace_join($1, 'LMAAAAA3')`, [y])
      // Joining again as an existing active student is fine.
      await cl.query(`select * from public.workspace_join($1, 'LMAAAAA2')`, [a])
      // Assigned Pro: one more place.
      await cl.query(`update public.workspaces set plan_id = (select id from public.workspace_plans where code='pro_t'), plan_until = now() + interval '30 days' where id = $1`, [ws])
      expect(await plan(cl, ws)).toBe('pro_t')
      await cl.query(`select * from public.workspace_join($1, 'LMAAAAA2')`, [x])
      // Expired assignment falls back to the default plan.
      await cl.query(`update public.workspaces set plan_until = now() - interval '1 minute' where id = $1`, [ws])
      expect(await plan(cl, ws)).toBe('free_t')
      // A removed student frees a place only for others; returning needs a place too.
      await cl.query(`update public.workspace_members set status='removed', removed_at=now() where workspace_id=$1 and user_id=$2`, [ws, x])
      await cl.query(`update public.workspace_members set status='removed', removed_at=now() where workspace_id=$1 and user_id=$2`, [ws, a])
      await cl.query(`select * from public.workspace_join($1, 'LMAAAAA2')`, [a])
      expect(await expectError(cl, `select * from public.workspace_join($1, 'LMAAAAA2')`, [x])).toMatch(/student limit reached/)
    })
  })

  it('only one default plan; an inactive plan cannot be default', async () => {
    await tx(async (cl) => {
      await cl.query(`insert into public.workspace_plans (code, name, is_default) values ('d1_t', 'D one', true)`)
      expect(await expectError(cl, `insert into public.workspace_plans (code, name, is_default) values ('d2_t', 'D two', true)`)).toMatch(/duplicate key/)
      expect(await expectError(cl, `insert into public.workspace_plans (code, name, is_default, is_active) values ('d3_t', 'D three', true, false)`)).toMatch(/check/)
    })
  })

  it('clients read active plans only, never write them, never call the functions', async () => {
    await tx(async (cl) => {
      const { teacher, ws } = await setup(cl)
      await cl.query(`insert into public.workspace_plans (code, name) values ('vis_t', 'Visible'), ('hid_t', 'Hidden')`)
      await cl.query(`update public.workspace_plans set is_active = false where code = 'hid_t'`)
      await cl.query('reset role')
      await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: teacher, role: 'authenticated' })])
      await cl.query('set local role authenticated')
      const codes = (await cl.query(`select code from public.workspace_plans where code in ('vis_t','hid_t')`)).rows.map((r) => r.code)
      expect(codes).toEqual(['vis_t'])
      expect(await expectError(cl, `update public.workspace_plans set max_students = 1`)).toMatch(/permission denied/)
      expect(await expectError(cl, `insert into public.workspace_plans (code, name) values ('x_t','X y')`)).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.workspaces set plan_id = null where id = $1`, [ws])).toMatch(/permission denied/)
      expect(await expectError(cl, `select * from public.workspace_effective_plan($1)`, [ws])).toMatch(/permission denied/)
      expect(await expectError(cl, `select * from public.workspace_join($1, 'LMAAAAA2')`, [teacher])).toMatch(/permission denied/)
    })
  })
})
