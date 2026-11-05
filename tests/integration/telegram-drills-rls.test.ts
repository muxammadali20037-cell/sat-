/** Migration 0030: drill items (with the correct choice) are server-only; drill settings change only through the server. */
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

describe('telegram drills (0030)', () => {
  it('no client access to items; settings are server-written', async () => {
    await withIdentity(c, { kind: 'service' }, async (cl) => {
      await cl.query('reset role')
      const a = await createUser(cl)
      await cl.query(`insert into public.telegram_accounts (user_id, telegram_user_id, created_via) values ($1, 777000111, 'link')`, [a])
      await cl.query(
        `insert into public.telegram_drill_items (user_id, drill_date, position, kind, ref, prompt, choices, correct_index) values ($1, current_date, 1, 'word', 'mitigate', 'Q', '["a","b","c","d"]', 2)`,
        [a],
      )
      expect((await cl.query('select drills_enabled from public.telegram_accounts where user_id=$1', [a])).rows[0].drills_enabled).toBe(false)
      await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: a, role: 'authenticated' })])
      await cl.query('set local role authenticated')
      expect(await expectError(cl, 'select correct_index from public.telegram_drill_items')).toMatch(/permission denied/)
      expect(await expectError(cl, 'update public.telegram_drill_items set answered_index = 2')).toMatch(/permission denied/)
      expect(await expectError(cl, 'update public.telegram_accounts set drills_enabled = true')).toMatch(/permission denied/)
      expect((await cl.query('select drills_enabled from public.telegram_accounts')).rows[0].drills_enabled).toBe(false)
      await cl.query('reset role')
      expect(await expectError(cl, `insert into public.telegram_drill_items (user_id, drill_date, position, kind, ref, prompt, choices, correct_index) values ($1, current_date, 2, 'word', 'x', 'Q', '["a"]', 0)`, [a])).toMatch(/check/)
      expect(await expectError(cl, `insert into public.telegram_drill_items (user_id, drill_date, position, kind, ref, prompt, choices, correct_index) values ($1, current_date, 1, 'word', 'x', 'Q', '["a","b"]', 0)`, [a])).toMatch(/duplicate/)
    })
  })
})
