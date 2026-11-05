/**
 * Migration 0027: guest links and guests are visible to the lesson's group staff (and a guest sees
 * their own row); students and other workspaces see nothing; no client writes; constraints.
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

describe('lesson guests (0027)', () => {
  it('visibility, no client writes, constraints', async () => {
    await tx(async (cl) => {
      const teacher = await createUser(cl)
      const student = await createUser(cl)
      const guest = await createUser(cl)
      const other = await createUser(cl)
      const ws = (await cl.query(`select public.workspace_create($1, 'WS', 'center', null, 'Asia/Tashkent') as id`, [teacher])).rows[0].id
      const g = (await cl.query(`insert into public.groups (workspace_id, name) values ($1, 'Group G') returning id`, [ws])).rows[0].id
      await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1,$2,'student','GSAAAAA2', now()+interval '1 day')`, [ws, g])
      await cl.query(`select * from public.workspace_join($1, 'GSAAAAA2')`, [student])
      const s = (await cl.query(`insert into public.class_sessions (workspace_id, group_id, title, starts_at, duration_minutes) values ($1,$2,'L1', now(), 60) returning id`, [ws, g])).rows[0].id
      const link = (await cl.query(`insert into public.class_session_guest_links (workspace_id, session_id, code, max_uses) values ($1,$2,'GUESTAB2', 2) returning id`, [ws, s])).rows[0].id
      await cl.query(`insert into public.class_session_guests (workspace_id, session_id, user_id, link_id, role) values ($1,$2,$3,$4,'guest_teacher')`, [ws, s, guest, link])

      await become(cl, teacher)
      expect(await n(cl, 'select count(*) n from public.class_session_guest_links')).toBe(1)
      expect(await n(cl, 'select count(*) n from public.class_session_guests')).toBe(1)
      await become(cl, guest)
      expect(await n(cl, 'select count(*) n from public.class_session_guests')).toBe(1)
      expect(await n(cl, 'select count(*) n from public.class_session_guest_links')).toBe(0)
      // A guest gets nothing else from the workspace.
      expect(await n(cl, 'select count(*) n from public.class_sessions')).toBe(0)
      expect(await n(cl, 'select count(*) n from public.workspace_members')).toBe(0)
      for (const who of [student, other]) {
        await become(cl, who)
        expect(await n(cl, 'select count(*) n from public.class_session_guest_links')).toBe(0)
        expect(await n(cl, 'select count(*) n from public.class_session_guests')).toBe(0)
      }
      for (const who of [teacher, guest]) {
        await become(cl, who)
        expect(await expectError(cl, `insert into public.class_session_guests (workspace_id, session_id, user_id, role) values ($1,$2,$3,'moderator')`, [ws, s, other])).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.class_session_guest_links set uses = 0`)).toMatch(/permission denied/)
        expect(await expectError(cl, `delete from public.class_session_guests`)).toMatch(/permission denied/)
      }
      await cl.query('reset role')
      expect(await expectError(cl, `insert into public.class_session_guest_links (workspace_id, session_id, code) values ($1,$2,'bad')`, [ws, s])).toMatch(/check/)
      expect(await expectError(cl, `update public.class_session_guest_links set uses = 3 where id = $1`, [link])).toMatch(/check/)
    })
  })
})
