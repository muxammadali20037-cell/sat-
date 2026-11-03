/**
 * Migration 0020: personal assignments. A teacher can give one student of a group their own
 * assignment. That student sees it; classmates do not; teachers of other workspaces do not; the
 * assignee must belong to the same group; clients still cannot write assignments.
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

const one = async (cl: Client, sql: string, params: unknown[] = []) => (await cl.query(sql, params)).rows[0]
const titles = async (cl: Client) => (await cl.query('select title from public.assignments order by title')).rows.map((r) => r.title)

async function world(cl: Client) {
  const teacher = await createUser(cl, { fullName: 'Teacher' })
  const otherTeacher = await createUser(cl, { fullName: 'Other teacher' })
  const alice = await createUser(cl, { fullName: 'Alice' })
  const bob = await createUser(cl, { fullName: 'Bob' })
  const outsider = await createUser(cl, { fullName: 'Outsider' })
  const ws = (await one(cl, `select public.workspace_create($1, 'Center', 'center', 'UZ', 'Asia/Tashkent') as id`, [teacher])).id
  const ws2 = (await one(cl, `select public.workspace_create($1, 'Other', 'individual', null, 'Asia/Tashkent') as id`, [otherTeacher])).id
  const group = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'SAT group') returning id`, [ws])).id
  const group2 = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'Second group') returning id`, [ws])).id
  await cl.query(`insert into public.group_members (workspace_id, group_id, user_id, role) values ($1, $2, $3, 'teacher')`, [ws, group, teacher])
  await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1, $2, 'student', 'PPPPPPP2', now() + interval '7 days')`, [ws, group])
  await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1, $2, 'student', 'PPPPPPP3', now() + interval '7 days')`, [ws, group2])
  await cl.query(`select * from public.workspace_join($1, 'PPPPPPP2')`, [alice])
  await cl.query(`select * from public.workspace_join($1, 'PPPPPPP2')`, [bob])
  await cl.query(`select * from public.workspace_join($1, 'PPPPPPP3')`, [outsider])
  const insert = (title: string, assignee: string | null, g = group) =>
    one(cl, `insert into public.assignments (workspace_id, group_id, title, kind, published_at, assignee_id) values ($1, $2, $3, 'text', now(), $4) returning id`, [ws, g, title, assignee])
  const groupWide = (await insert('Group essay', null)).id
  const forAlice = (await insert('Alice drill', alice)).id
  const forBob = (await insert('Bob drill', bob)).id
  return { teacher, otherTeacher, alice, bob, outsider, ws, ws2, group, group2, groupWide, forAlice, forBob }
}

describe('personal assignments (0020)', () => {
  it('a student sees group-wide work and their own personal work only', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.alice)
      expect(await titles(cl)).toEqual(['Alice drill', 'Group essay'])
      await become(cl, w.bob)
      expect(await titles(cl)).toEqual(['Bob drill', 'Group essay'])
      // Asking for another student's assignment by id returns nothing.
      expect((await cl.query('select id from public.assignments where id = $1', [w.forAlice])).rowCount).toBe(0)
    })
  })

  it('the group teacher sees every personal assignment; other workspaces and other groups see none', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.teacher)
      expect(await titles(cl)).toEqual(['Alice drill', 'Bob drill', 'Group essay'])
      await become(cl, w.otherTeacher)
      expect(await titles(cl)).toEqual([])
      await become(cl, w.outsider) // student of another group in the same workspace
      expect(await titles(cl)).toEqual([])
    })
  })

  it('a personal assignment stops being visible when the student leaves the group', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await cl.query(`update public.group_members set left_at = now() where group_id = $1 and user_id = $2`, [w.group, w.alice])
      await become(cl, w.alice)
      expect(await titles(cl)).toEqual([])
    })
  })

  it('the assignee must be a member of the same group', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      const sql = `insert into public.assignments (workspace_id, group_id, title, kind, published_at, assignee_id) values ($1, $2, 'Wrong', 'text', now(), $3)`
      expect(await expectError(cl, sql, [w.ws, w.group, w.outsider])).toMatch(/assignments_assignee_fk/)
      expect(await expectError(cl, sql, [w.ws, w.group2, w.alice])).toMatch(/assignments_assignee_fk/)
    })
  })

  it('clients still cannot insert, update or delete assignments (including assignee_id)', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      for (const who of [w.teacher, w.alice]) {
        await become(cl, who)
        expect(await expectError(cl, `insert into public.assignments (workspace_id, group_id, title, kind, published_at) values ($1, $2, 'x', 'text', now())`, [w.ws, w.group])).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.assignments set assignee_id = $1 where id = $2`, [w.alice, w.forBob])).toMatch(/permission denied/)
        expect(await expectError(cl, `delete from public.assignments where id = $1`, [w.forAlice])).toMatch(/permission denied/)
      }
    })
  })
})
