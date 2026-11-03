/**
 * Migration 0021 (Resource Hub): students see published links only; nobody but the server can
 * write; anonymous visitors see nothing; a link cannot be published without a passing link check;
 * only https URLs are stored.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { connect, createUser, expectError, withIdentity } from './db'

let c: Client
let student: string
let editor: string
let published: string
let draft: string
const suffix = Math.random().toString(36).slice(2, 8)

const insert = async (url: string, extra = '') =>
  (
    await c.query(
      `insert into public.learning_resources (provider, provider_name, kind, title, url, usage_terms, attribution ${extra ? ', status, link_status, link_checked_at, published_at' : ''})
       values ('desmos', 'Desmos', 'tool', 'Graphing calculator', $1, 'Link only.', 'Desmos' ${extra}) returning id`,
      [url],
    )
  ).rows[0].id as string

beforeAll(async () => {
  c = await connect()
  student = await createUser(c, { fullName: 'Res Student' })
  editor = await createUser(c, { role: 'CONTENT_EDITOR' })
  published = await insert(`https://www.desmos.com/calculator?${suffix}`, `, 'published', 200, now(), now()`)
  draft = await insert(`https://www.desmos.com/scientific?${suffix}`)
})
afterAll(async () => {
  if (!c) return
  await c.query('delete from public.learning_resources where id = any($1)', [[published, draft]])
  await c.end()
})

const ids = async (cl: Client) => (await cl.query('select id from public.learning_resources where id = any($1)', [[published, draft]])).rows.map((r) => r.id)

describe('learning_resources (0021)', () => {
  it('students read published links only; staff read drafts too; anon nothing', async () => {
    expect(await withIdentity(c, { kind: 'user', userId: student }, ids)).toEqual([published])
    expect((await withIdentity(c, { kind: 'user', userId: editor }, ids)).sort()).toEqual([published, draft].sort())
    expect(await withIdentity(c, { kind: 'anon' }, async (cl) => expectError(cl, 'select id from public.learning_resources'))).toMatch(/permission denied/)
  })

  it('no client can insert, update or delete (not even content editors)', async () => {
    for (const userId of [student, editor]) {
      await withIdentity(c, { kind: 'user', userId }, async (cl) => {
        expect(await expectError(cl, `insert into public.learning_resources (provider, provider_name, kind, title, url, usage_terms, attribution) values ('other','X Y','article','Title','https://example.com/${suffix}','Link only.','X')`)).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.learning_resources set status = 'published' where id = $1`, [draft])).toMatch(/permission denied/)
        expect(await expectError(cl, `delete from public.learning_resources where id = $1`, [published])).toMatch(/permission denied/)
      })
    }
  })

  it('publishing requires a passing link check, and only https URLs are stored', async () => {
    await c.query('begin')
    try {
      expect(await expectError(c, `update public.learning_resources set status = 'published', published_at = now() where id = $1`, [draft])).toMatch(/check/)
      expect(await expectError(c, `update public.learning_resources set status = 'published', published_at = now(), link_status = 404, link_checked_at = now() where id = $1`, [draft])).toMatch(/check/)
      expect(await expectError(c, `update public.learning_resources set url = 'http://www.desmos.com/x' where id = $1`, [draft])).toMatch(/check/)
      expect(await expectError(c, `update public.learning_resources set url = 'javascript:alert(1)' where id = $1`, [draft])).toMatch(/check/)
      await c.query(`update public.learning_resources set status = 'published', published_at = now(), link_status = 301, link_checked_at = now() where id = $1`, [draft])
    } finally {
      await c.query('rollback')
    }
  })
})
