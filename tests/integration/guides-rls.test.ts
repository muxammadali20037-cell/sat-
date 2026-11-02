/**
 * Study guides (RLS, as the `authenticated` role): students read published guides only, cannot
 * write guides or their content, and manage only their own "read" marks. Content managers can
 * write; publishing requires content.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asAnon, asUser, connect, createUser, expectError } from './db'

let c: Client
let alice: string
let bob: string
let editor: string
let teacher: string
let published: string
let draft: string
const suffix = Math.random().toString(36).slice(2, 8)

const sections = JSON.stringify([
  { type: 'concept', heading: 'Tushuncha', body: 'Matn.' },
  { type: 'note', heading: 'Eslatma', body: 'Matn.' },
])

beforeAll(async () => {
  c = await connect()
  alice = await createUser(c, { fullName: 'Alice Student' })
  bob = await createUser(c, { fullName: 'Bob Student' })
  editor = await createUser(c, { role: 'CONTENT_EDITOR' })
  teacher = await createUser(c, { role: 'TEACHER' })
  const p = await c.query(`insert into public.guides (slug, kind, position) values ($1, 'strategy', 900) returning id`, [`rls-published-${suffix}`])
  published = p.rows[0].id
  await c.query(`insert into public.guide_contents (guide_id, locale, title, summary, sections) values ($1, 'uz', 'Nashr qilingan', '', $2::jsonb)`, [published, sections])
  await c.query(`update public.guides set status = 'published' where id = $1`, [published])
  const d = await c.query(`insert into public.guides (slug, kind, position) values ($1, 'strategy', 901) returning id`, [`rls-draft-${suffix}`])
  draft = d.rows[0].id
  await c.query(`insert into public.guide_contents (guide_id, locale, title, summary, sections) values ($1, 'uz', 'Qoralama', '', $2::jsonb)`, [draft, sections])
})

afterAll(async () => {
  if (!c) return
  await c.query(`delete from public.guides where id = any($1)`, [[published, draft]]).catch(() => undefined)
  await c.query(`delete from auth.users where id = any($1)`, [[alice, bob, editor, teacher]]).catch(() => undefined)
  await c.end()
})

describe('students', () => {
  it('read published guides and their content, never drafts', async () => {
    await asUser(c, alice, async (db) => {
      const g = await db.query(`select id from public.guides where id = any($1)`, [[published, draft]])
      expect(g.rows.map((r) => r.id)).toEqual([published])
      const content = await db.query(`select guide_id from public.guide_contents where guide_id = any($1)`, [[published, draft]])
      expect(content.rows.map((r) => r.guide_id)).toEqual([published])
    })
  })

  it('cannot create, edit or publish guides or content', async () => {
    await asUser(c, alice, async (db) => {
      expect(await expectError(db, `insert into public.guides (slug, kind) values ('student-${suffix}', 'strategy')`)).toMatch(/row-level security/)
      const upd = await db.query(`update public.guides set status = 'published' where id = $1`, [draft])
      expect(upd.rowCount).toBe(0)
      const upd2 = await db.query(`update public.guide_contents set title = 'Hacked' where guide_id = $1`, [published])
      expect(upd2.rowCount).toBe(0)
      const del = await db.query(`delete from public.guide_contents where guide_id = $1`, [published])
      expect(del.rowCount).toBe(0)
    })
  })

  it('mark their own reads, only for published guides, and never for someone else', async () => {
    await asUser(c, alice, async (db) => {
      await db.query(`insert into public.guide_reads (user_id, guide_id) values ($1, $2)`, [alice, published])
      expect(await expectError(db, `insert into public.guide_reads (user_id, guide_id) values ($1, $2)`, [alice, draft])).toMatch(/row-level security/)
      expect(await expectError(db, `insert into public.guide_reads (user_id, guide_id) values ($1, $2)`, [bob, published])).toMatch(/row-level security/)
      const own = await db.query(`select user_id from public.guide_reads where guide_id = $1`, [published])
      expect(own.rows.map((r) => r.user_id)).toEqual([alice])
    })
  })

  it("cannot see another student's read marks", async () => {
    await c.query(`insert into public.guide_reads (user_id, guide_id) values ($1, $2) on conflict do nothing`, [bob, published])
    try {
      await asUser(c, alice, async (db) => {
        const { rows } = await db.query(`select * from public.guide_reads where user_id = $1`, [bob])
        expect(rows).toHaveLength(0)
      })
    } finally {
      await c.query(`delete from public.guide_reads where user_id = $1`, [bob])
    }
  })
})

describe('anonymous visitors', () => {
  it('cannot read guides at all', async () => {
    await asAnon(c, async (db) => {
      expect(await expectError(db, `select id from public.guides`)).toMatch(/permission denied/)
    })
  })
})

describe('staff', () => {
  it('teachers can read drafts but not edit', async () => {
    await asUser(c, teacher, async (db) => {
      const { rows } = await db.query(`select id from public.guides where id = $1`, [draft])
      expect(rows).toHaveLength(1)
      const upd = await db.query(`update public.guides set position = 5 where id = $1`, [draft])
      expect(upd.rowCount).toBe(0)
    })
  })

  it('content editors create guides, and publishing requires content', async () => {
    await asUser(c, editor, async (db) => {
      const g = await db.query(`insert into public.guides (slug, kind, created_by) values ($1, 'strategy', $2) returning id`, [`editor-${suffix}`, editor])
      const id = g.rows[0].id
      expect(await expectError(db, `update public.guides set status = 'published' where id = $1`, [id])).toMatch(/needs content/)
      await db.query(`insert into public.guide_contents (guide_id, locale, title, sections) values ($1, 'uz', 'Yangi', $2::jsonb)`, [id, sections])
      const pub = await db.query(`update public.guides set status = 'published' where id = $1 returning published_at`, [id])
      expect(pub.rows[0].published_at).not.toBeNull()
    })
  })

  it('keeps one live guide per skill', async () => {
    const skill = (await c.query(`select id from public.skills where code = 'transitions'`)).rows[0].id
    await asUser(c, editor, async (db) => {
      await db.query(`delete from public.guides where skill_id = $1`, [skill])
      await db.query(`insert into public.guides (slug, kind, skill_id) values ($1, 'skill', $2)`, [`t1-${suffix}`, skill])
      expect(await expectError(db, `insert into public.guides (slug, kind, skill_id) values ($1, 'skill', $2)`, [`t2-${suffix}`, skill])).toMatch(/duplicate key/)
    })
  })
})
