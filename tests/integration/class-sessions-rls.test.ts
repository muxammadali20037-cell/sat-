/**
 * Migration 0022: lessons, attendance and class materials. Staff of the group and its students
 * read; a student reads only their own attendance; other workspaces and other groups read nothing;
 * clients never write; composite FKs keep rows inside one workspace; storage paths are checked.
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
const n = async (cl: Client, sql: string, params: unknown[] = []) => Number((await cl.query(sql, params)).rows[0].n)

async function world(cl: Client) {
  const teacher = await createUser(cl, { fullName: 'T' })
  const other = await createUser(cl, { fullName: 'Other T' })
  const alice = await createUser(cl, { fullName: 'Alice' })
  const bob = await createUser(cl, { fullName: 'Bob' })
  const carol = await createUser(cl, { fullName: 'Carol (other group)' })
  const ws = (await one(cl, `select public.workspace_create($1, 'WS', 'center', null, 'Asia/Tashkent') as id`, [teacher])).id
  const ws2 = (await one(cl, `select public.workspace_create($1, 'WS2', 'individual', null, 'Asia/Tashkent') as id`, [other])).id
  const g = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'G1') returning id`, [ws])).id
  const g2 = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'G2') returning id`, [ws])).id
  const g3 = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'G3') returning id`, [ws2])).id
  await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1,$2,'student','LSNAAAA2', now()+interval '1 day'), ($1,$3,'student','LSNAAAA3', now()+interval '1 day')`, [ws, g, g2])
  for (const [u, code] of [[alice, 'LSNAAAA2'], [bob, 'LSNAAAA2'], [carol, 'LSNAAAA3']]) await cl.query(`select * from public.workspace_join($1, $2)`, [u, code])
  const s = (await one(cl, `insert into public.class_sessions (workspace_id, group_id, title, starts_at, duration_minutes, meeting_url) values ($1,$2,'Lesson 1', now(), 60, 'https://meet.example.com/x') returning id`, [ws, g])).id
  const s3 = (await one(cl, `insert into public.class_sessions (workspace_id, group_id, title, starts_at, duration_minutes) values ($1,$2,'Other ws lesson', now(), 60) returning id`, [ws2, g3])).id
  await cl.query(`insert into public.attendance (workspace_id, session_id, student_id, status) values ($1,$2,$3,'present'), ($1,$2,$4,'absent')`, [ws, s, alice, bob])
  await cl.query(`insert into public.class_materials (workspace_id, group_id, title, kind, url) values ($1,$2,'Notes','link','https://example.com/notes')`, [ws, g])
  await cl.query(`insert into public.class_materials (workspace_id, group_id, title, kind, url, archived_at) values ($1,$2,'Old notes','link','https://example.com/old', now())`, [ws, g])
  return { teacher, other, alice, bob, carol, ws, ws2, g, g2, g3, s, s3 }
}

describe('class lessons (0022)', () => {
  it('group students see their lessons and active materials; staff see archived ones too', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.alice)
      expect(await n(cl, 'select count(*) n from public.class_sessions')).toBe(1)
      expect((await cl.query('select title from public.class_materials')).rows.map((r) => r.title)).toEqual(['Notes'])
      await become(cl, w.teacher)
      expect(await n(cl, 'select count(*) n from public.class_sessions')).toBe(1)
      expect(await n(cl, 'select count(*) n from public.class_materials')).toBe(2)
      expect(await n(cl, 'select count(*) n from public.attendance')).toBe(2)
    })
  })
  it('a student sees only their own attendance; other groups and workspaces see nothing', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.bob)
      expect((await cl.query('select status from public.attendance')).rows.map((r) => r.status)).toEqual(['absent'])
      await become(cl, w.carol)
      expect(await n(cl, 'select count(*) n from public.class_sessions')).toBe(0)
      expect(await n(cl, 'select count(*) n from public.class_materials')).toBe(0)
      expect(await n(cl, 'select count(*) n from public.attendance')).toBe(0)
      await become(cl, w.other)
      expect((await cl.query('select title from public.class_sessions')).rows.map((r) => r.title)).toEqual(['Other ws lesson'])
      expect(await n(cl, 'select count(*) n from public.attendance')).toBe(0)
    })
  })
  it('anon has no access and clients cannot write (insert, update, delete separately)', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await cl.query('reset role')
      await cl.query('set local role anon')
      expect(await expectError(cl, 'select 1 from public.class_sessions')).toMatch(/permission denied/)
      for (const who of [w.teacher, w.alice]) {
        await become(cl, who)
        expect(await expectError(cl, `insert into public.class_sessions (workspace_id, group_id, title, starts_at, duration_minutes) values ($1,$2,'x y', now(), 60)`, [w.ws, w.g])).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.attendance set status='present' where student_id=$1`, [w.bob])).toMatch(/permission denied/)
        expect(await expectError(cl, `delete from public.class_materials`)).toMatch(/permission denied/)
        expect(await expectError(cl, `insert into public.attendance (workspace_id, session_id, student_id, status) values ($1,$2,$3,'present')`, [w.ws, w.s, w.carol])).toMatch(/permission denied/)
      }
    })
  })
  it('composite keys stop cross-workspace rows; constraints guard URLs and storage paths', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      // A lesson in ws2 cannot use a group of ws.
      expect(await expectError(cl, `insert into public.class_sessions (workspace_id, group_id, title, starts_at, duration_minutes) values ($1,$2,'x y', now(), 60)`, [w.ws2, w.g])).toMatch(/foreign key/)
      // Attendance for a student who is not a member of that workspace.
      expect(await expectError(cl, `insert into public.attendance (workspace_id, session_id, student_id, status) values ($1,$2,$3,'present')`, [w.ws2, w.s3, w.alice])).toMatch(/foreign key/)
      expect(await expectError(cl, `insert into public.class_sessions (workspace_id, group_id, title, starts_at, duration_minutes, meeting_url) values ($1,$2,'x y', now(), 60, 'javascript:alert(1)')`, [w.ws, w.g])).toMatch(/check/)
      expect(await expectError(cl, `insert into public.class_materials (workspace_id, group_id, title, kind, storage_path, mime_type, size_bytes) values ($1,$2,'f','file','../etc/passwd','application/pdf',10)`, [w.ws, w.g])).toMatch(/check/)
      expect(await expectError(cl, `insert into public.class_materials (workspace_id, group_id, title, kind) values ($1,$2,'no target','link')`, [w.ws, w.g])).toMatch(/check/)
      expect(await expectError(cl, `insert into public.class_materials (workspace_id, group_id, title, kind, storage_path, mime_type, size_bytes) values ($1,$2,'big','file',$3,'application/pdf', 30000000)`, [w.ws, w.g, `ws/${w.ws}/${w.g}/${w.ws}.pdf`])).toMatch(/check/)
    })
  })
  it('a student who leaves the group stops seeing its lessons and materials', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await cl.query('update public.group_members set left_at = now() where group_id = $1 and user_id = $2', [w.g, w.alice])
      await become(cl, w.alice)
      expect(await n(cl, 'select count(*) n from public.class_sessions')).toBe(0)
      expect(await n(cl, 'select count(*) n from public.class_materials')).toBe(0)
      // Their own attendance history stays visible to them.
      expect(await n(cl, 'select count(*) n from public.attendance')).toBe(1)
    })
  })
})
