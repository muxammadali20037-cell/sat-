/**
 * Migration 0019 (classroom): multi-tenant isolation.
 * Two teachers with separate workspaces share one student. Each teacher must see only their own
 * workspace; students see only their own groups, published assignments and their own work.
 * SELECT, INSERT, UPDATE and DELETE are checked separately; the atomic join/create functions are
 * checked for limits, expiry, max uses and role rules.
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
  await cl.query('reset role')
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await cl.query('set local role authenticated')
}

const one = async (cl: Client, sql: string, params: unknown[] = []) => (await cl.query(sql, params)).rows[0]
const count = async (cl: Client, sql: string, params: unknown[] = []) => Number((await cl.query(sql, params)).rows[0].n)

/** Two workspaces, two teachers, a shared student, a private student, groups, assignments, submissions. */
async function world(cl: Client) {
  const teacherA = await createUser(cl, { fullName: 'Teacher A' })
  const teacherB = await createUser(cl, { fullName: 'Teacher B' })
  const shared = await createUser(cl, { fullName: 'Shared Student' })
  const onlyA = await createUser(cl, { fullName: 'Only A' })
  const assistantA = await createUser(cl, { fullName: 'Assistant A' })
  const wsA = (await one(cl, `select public.workspace_create($1, 'Workspace A', 'individual', 'UZ', 'Asia/Tashkent') as id`, [teacherA])).id
  const wsB = (await one(cl, `select public.workspace_create($1, 'Workspace B', 'center', null, 'Asia/Tashkent') as id`, [teacherB])).id
  const groupA = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'A group') returning id`, [wsA])).id
  const groupA2 = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'A second group') returning id`, [wsA])).id
  const groupB = (await one(cl, `insert into public.groups (workspace_id, name) values ($1, 'B group') returning id`, [wsB])).id
  const invite = async (ws: string, group: string | null, role: string, code: string, extra = '') =>
    cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at ${extra ? ', max_uses' : ''}) values ($1, $2, $3, $4, now() + interval '7 days' ${extra ? `, ${extra}` : ''})`, [ws, group, role, code])
  await invite(wsA, groupA, 'student', 'AAAAAAA2')
  await invite(wsB, groupB, 'student', 'BBBBBBB2')
  await invite(wsA, groupA2, 'assistant', 'AAAAAAA3')
  await cl.query(`select * from public.workspace_join($1, 'AAAAAAA2')`, [shared])
  await cl.query(`select * from public.workspace_join($1, 'AAAAAAA2')`, [onlyA])
  await cl.query(`select * from public.workspace_join($1, 'BBBBBBB2')`, [shared])
  await cl.query(`select * from public.workspace_join($1, 'AAAAAAA3')`, [assistantA])
  const asgA = (await one(cl, `insert into public.assignments (workspace_id, group_id, title, kind, published_at) values ($1, $2, 'Essay A', 'text', now()) returning id`, [wsA, groupA])).id
  const draftA = (await one(cl, `insert into public.assignments (workspace_id, group_id, title, kind, status) values ($1, $2, 'Draft A', 'text', 'draft') returning id`, [wsA, groupA])).id
  const asgB = (await one(cl, `insert into public.assignments (workspace_id, group_id, title, kind, published_at) values ($1, $2, 'Essay B', 'text', now()) returning id`, [wsB, groupB])).id
  await cl.query(`insert into public.submissions (workspace_id, assignment_id, student_id, status, text_answer, submitted_at) values ($1, $2, $3, 'submitted', 'mine A', now())`, [wsA, asgA, shared])
  await cl.query(`insert into public.submissions (workspace_id, assignment_id, student_id, status, text_answer, submitted_at) values ($1, $2, $3, 'submitted', 'other A', now())`, [wsA, asgA, onlyA])
  await cl.query(`insert into public.submissions (workspace_id, assignment_id, student_id, status, text_answer, submitted_at) values ($1, $2, $3, 'submitted', 'mine B', now())`, [wsB, asgB, shared])
  return { teacherA, teacherB, shared, onlyA, assistantA, wsA, wsB, groupA, groupA2, groupB, asgA, draftA, asgB }
}

describe('classroom SELECT isolation', () => {
  it('a teacher sees only their own workspace, groups, members, invitations, assignments and submissions', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.teacherA)
      expect((await cl.query('select id from public.workspaces')).rows.map((r) => r.id)).toEqual([w.wsA])
      expect(await count(cl, 'select count(*) as n from public.groups where workspace_id = $1', [w.wsB])).toBe(0)
      expect(await count(cl, 'select count(*) as n from public.groups')).toBe(2)
      expect(await count(cl, 'select count(*) as n from public.workspace_members where workspace_id = $1', [w.wsB])).toBe(0)
      expect(await count(cl, 'select count(*) as n from public.workspace_members')).toBe(4) // owner, 2 students, assistant
      expect(await count(cl, 'select count(*) as n from public.workspace_invitations where workspace_id = $1', [w.wsB])).toBe(0)
      expect(await count(cl, 'select count(*) as n from public.assignments where id = $1', [w.asgB])).toBe(0)
      expect(await count(cl, 'select count(*) as n from public.assignments')).toBe(2) // incl. own draft
      // The shared student's work in workspace B is invisible to teacher A.
      expect((await cl.query('select text_answer from public.submissions order by text_answer')).rows.map((r) => r.text_answer)).toEqual(['mine A', 'other A'])
      expect(await count(cl, 'select count(*) as n from public.group_members where group_id = $1', [w.groupB])).toBe(0)
    })
  })

  it('an assistant sees only the groups they are assigned to', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.assistantA)
      expect((await cl.query('select id from public.groups')).rows.map((r) => r.id)).toEqual([w.groupA2])
      expect(await count(cl, 'select count(*) as n from public.submissions')).toBe(0)
      expect(await count(cl, 'select count(*) as n from public.workspace_invitations')).toBe(1) // only for the group they teach
    })
  })

  it('a student sees their own groups and published assignments, only their own submissions, and no invitations', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.shared)
      expect(await count(cl, 'select count(*) as n from public.workspaces')).toBe(2)
      expect((await cl.query('select id from public.groups order by name')).rows.map((r) => r.id)).toEqual([w.groupA, w.groupB])
      expect((await cl.query('select title from public.assignments order by title')).rows.map((r) => r.title)).toEqual(['Essay A', 'Essay B'])
      expect((await cl.query('select text_answer from public.submissions order by text_answer')).rows.map((r) => r.text_answer)).toEqual(['mine A', 'mine B'])
      expect(await count(cl, 'select count(*) as n from public.workspace_invitations')).toBe(0)
      // Roster: own rows and staff, never other students.
      const visible = (await cl.query('select user_id, role from public.workspace_members')).rows
      expect(visible.some((r) => r.user_id === w.onlyA)).toBe(false)
      expect(visible.filter((r) => r.role !== 'student').length).toBeGreaterThan(0)
      expect(await count(cl, 'select count(*) as n from public.group_members where user_id = $1', [w.onlyA])).toBe(0)
    })
  })

  it('a stranger and an anonymous visitor see nothing', async () => {
    await tx(async (cl) => {
      await world(cl)
      const stranger = await createUser(cl)
      await become(cl, stranger)
      for (const t of ['workspaces', 'workspace_members', 'groups', 'group_members', 'workspace_invitations', 'progress_sharing', 'assignments', 'submissions']) {
        expect(await count(cl, `select count(*) as n from public.${t}`), t).toBe(0)
      }
    })
    await asAnon(c, async (cl) => {
      expect(await expectError(cl, 'select * from public.workspaces')).toMatch(/permission denied/)
      expect(await expectError(cl, 'select * from public.submissions')).toMatch(/permission denied/)
    })
  })

  it('a removed member loses access', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await cl.query(`update public.workspace_members set status = 'removed', removed_at = now() where workspace_id = $1 and user_id = $2`, [w.wsA, w.onlyA])
      await become(cl, w.onlyA)
      expect(await count(cl, 'select count(*) as n from public.workspaces')).toBe(0)
      expect(await count(cl, 'select count(*) as n from public.assignments')).toBe(0)
    })
  })
})

describe('classroom INSERT / UPDATE / DELETE are server-only', () => {
  it('INSERT: teachers and students cannot create rows directly', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.teacherA)
      expect(await expectError(cl, `insert into public.groups (workspace_id, name) values ($1, 'x')`, [w.wsA])).toMatch(/permission denied/)
      expect(await expectError(cl, `insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'student')`, [w.wsB, w.teacherA])).toMatch(/permission denied/)
      await become(cl, w.shared)
      expect(await expectError(cl, `insert into public.submissions (workspace_id, assignment_id, student_id, status) values ($1, $2, $3, 'started')`, [w.wsA, w.draftA, w.shared])).toMatch(/permission denied/)
      expect(await expectError(cl, `insert into public.progress_sharing (workspace_id, student_id) values ($1, $2)`, [w.wsA, w.shared])).toMatch(/permission denied/)
    })
  })
  it('UPDATE: nobody can change roles, grades or workspaces directly', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.shared)
      expect(await expectError(cl, `update public.workspace_members set role = 'owner' where user_id = $1`, [w.shared])).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.submissions set score = 100 where student_id = $1`, [w.shared])).toMatch(/permission denied/)
      await become(cl, w.teacherA)
      expect(await expectError(cl, `update public.workspaces set owner_id = $1`, [w.teacherA])).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.assignments set title = 'x'`)).toMatch(/permission denied/)
    })
  })
  it('DELETE: nobody can delete classroom rows directly', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.teacherA)
      for (const t of ['workspaces', 'workspace_members', 'groups', 'group_members', 'workspace_invitations', 'assignments', 'submissions']) {
        expect(await expectError(cl, `delete from public.${t}`), t).toMatch(/permission denied/)
      }
      void w
    })
  })
})

describe('classroom integrity', () => {
  it('rows cannot point across workspaces (composite foreign keys)', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      expect(await expectError(cl, `insert into public.assignments (workspace_id, group_id, title, kind, published_at) values ($1, $2, 'cross', 'text', now())`, [w.wsA, w.groupB])).toMatch(/foreign key/)
      // A group member must be a member of the group's workspace.
      expect(await expectError(cl, `insert into public.group_members (workspace_id, group_id, user_id, role) values ($1, $2, $3, 'student')`, [w.wsB, w.groupB, w.onlyA])).toMatch(/foreign key/)
      expect(await expectError(cl, `insert into public.submissions (workspace_id, assignment_id, student_id) values ($1, $2, $3)`, [w.wsB, w.asgA, w.assistantA])).toMatch(/foreign key/)
      expect(await expectError(cl, `insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at) values ($1, $2, 'student', 'CCCCCCC2', now() + interval '1 day')`, [w.wsA, w.groupB])).toMatch(/foreign key/)
    })
  })
  it('validates kinds, codes and statuses', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      expect(await expectError(cl, `insert into public.assignments (workspace_id, group_id, title, kind, published_at) values ($1, $2, 'p', 'practice', now())`, [w.wsA, w.groupA])).toMatch(/check constraint/)
      expect(await expectError(cl, `insert into public.assignments (workspace_id, group_id, title, kind, published_at) values ($1, $2, 'm', 'mock_exam', now())`, [w.wsA, w.groupA])).toMatch(/check constraint/)
      expect(await expectError(cl, `insert into public.workspace_invitations (workspace_id, role, code, expires_at) values ($1, 'student', 'abc', now())`, [w.wsA])).toMatch(/check constraint/)
      expect(await expectError(cl, `insert into public.workspace_invitations (workspace_id, role, code, expires_at) values ($1, 'owner', 'DDDDDDD2', now())`, [w.wsA])).toMatch(/check constraint/)
      expect(await expectError(cl, `insert into public.submissions (workspace_id, assignment_id, student_id, status) values ($1, $2, $3, 'graded')`, [w.wsA, w.asgA, w.assistantA])).toMatch(/check constraint/)
    })
  })
})

describe('workspace_create and workspace_join', () => {
  it('creates the owner membership and caps active workspaces at 5', async () => {
    await tx(async (cl) => {
      const t = await createUser(cl)
      const id = (await one(cl, `select public.workspace_create($1, 'One', 'individual', null, null) as id`, [t])).id
      expect((await one(cl, 'select role from public.workspace_members where workspace_id = $1 and user_id = $2', [id, t])).role).toBe('owner')
      for (let i = 0; i < 4; i++) await cl.query(`select public.workspace_create($1, 'More', 'individual', null, null)`, [t])
      expect(await expectError(cl, `select public.workspace_create($1, 'Sixth', 'individual', null, null)`, [t])).toMatch(/workspace limit/)
    })
  })
  it('rejects expired, revoked, unknown and used-up codes; counts each new member once', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await cl.query(`insert into public.workspace_invitations (workspace_id, group_id, role, code, expires_at, max_uses) values ($1, $2, 'student', 'EEEEEEE2', now() + interval '1 day', 1)`, [w.wsA, w.groupA])
      await cl.query(`insert into public.workspace_invitations (workspace_id, role, code, expires_at) values ($1, 'student', 'FFFFFFF2', now() - interval '1 minute')`, [w.wsA])
      await cl.query(`insert into public.workspace_invitations (workspace_id, role, code, expires_at, revoked_at) values ($1, 'student', 'GGGGGGG2', now() + interval '1 day', now())`, [w.wsA])
      const s1 = await createUser(cl)
      const s2 = await createUser(cl)
      const first = await one(cl, `select * from public.workspace_join($1, 'eeeeeee2')`, [s1]) // case-insensitive
      expect(first).toMatchObject({ workspace_id: w.wsA, group_id: w.groupA, role: 'student', joined: true })
      const again = await one(cl, `select * from public.workspace_join($1, 'EEEEEEE2')`, [s1])
      expect(again.joined).toBe(false)
      expect(await expectError(cl, `select * from public.workspace_join($1, 'EEEEEEE2')`, [s2])).toMatch(/used up/)
      expect(await expectError(cl, `select * from public.workspace_join($1, 'FFFFFFF2')`, [s2])).toMatch(/expired/)
      expect(await expectError(cl, `select * from public.workspace_join($1, 'GGGGGGG2')`, [s2])).toMatch(/expired/)
      expect(await expectError(cl, `select * from public.workspace_join($1, 'HHHHHHH2')`, [s2])).toMatch(/not found/)
      expect((await one(cl, `select uses from public.workspace_invitations where code = 'EEEEEEE2'`)).uses).toBe(1)
    })
  })
  it('never downgrades: a staff invite upgrades a student, a student invite keeps staff and the owner', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await cl.query(`insert into public.workspace_invitations (workspace_id, role, code, expires_at) values ($1, 'teacher', 'JJJJJJJ2', now() + interval '1 day')`, [w.wsA])
      expect((await one(cl, `select * from public.workspace_join($1, 'JJJJJJJ2')`, [w.onlyA])).role).toBe('teacher')
      expect((await one(cl, `select * from public.workspace_join($1, 'AAAAAAA2')`, [w.teacherA])).role).toBe('owner')
    })
  })
  it('only the server can call the atomic functions', async () => {
    await tx(async (cl) => {
      const w = await world(cl)
      await become(cl, w.shared)
      expect(await expectError(cl, `select * from public.workspace_join($1, 'AAAAAAA2')`, [w.shared])).toMatch(/permission denied/)
      expect(await expectError(cl, `select public.workspace_create($1, 'Mine', 'individual', null, null)`, [w.shared])).toMatch(/permission denied/)
    })
  })
})

describe('telegram_accounts phone numbers (S1)', () => {
  it('a global TEACHER no longer reads other students’ Telegram links; admins still do', async () => {
    await tx(async (cl) => {
      const teacher = await createUser(cl, { role: 'TEACHER' })
      const admin = await createUser(cl, { role: 'ADMIN' })
      const s = await createUser(cl)
      await cl.query(`insert into public.telegram_accounts (user_id, telegram_user_id, created_via, phone_number) values ($1, 991001, 'link', '+998901112233')`, [s])
      await become(cl, teacher)
      expect(await count(cl, 'select count(*) as n from public.telegram_accounts')).toBe(0)
      await become(cl, admin)
      expect(await count(cl, 'select count(*) as n from public.telegram_accounts')).toBe(1)
      await become(cl, s)
      expect(await count(cl, 'select count(*) as n from public.telegram_accounts')).toBe(1)
    })
  })
})
