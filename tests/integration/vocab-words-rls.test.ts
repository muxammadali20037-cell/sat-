/** Migration 0028: a student reads only their own saved words; clients cannot write; constraints. */
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
async function become(cl: Client, userId: string) {
  await cl.query('reset role')
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await cl.query('set local role authenticated')
}
const n = async (cl: Client, sql: string) => Number((await cl.query(sql)).rows[0].n)

describe('my words (0028)', () => {
  it('own rows only, no client writes, constraints', async () => {
    await withIdentity(c, { kind: 'service' }, async (cl) => {
      await cl.query('reset role')
      const a = await createUser(cl)
      const b = await createUser(cl)
      await cl.query(`insert into public.vocab_words (user_id, word, display, in_dictionary, source) values ($1,'mitigate','mitigate',true,'practice'), ($2,'resilient','resilient',true,'lesson')`, [a, b])
      await become(cl, a)
      expect(await n(cl, 'select count(*) n from public.vocab_words')).toBe(1)
      expect((await cl.query('select word from public.vocab_words')).rows[0].word).toBe('mitigate')
      expect(await expectError(cl, `insert into public.vocab_words (user_id, word, display) values ($1,'thrive','thrive')`, [a])).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.vocab_words set translation = 'x'`)).toMatch(/permission denied/)
      expect(await expectError(cl, `delete from public.vocab_words`)).toMatch(/permission denied/)
      await cl.query('reset role')
      await cl.query(`set local role anon`)
      expect(await expectError(cl, 'select * from public.vocab_words')).toMatch(/permission denied/)
      await cl.query('reset role')
      expect(await expectError(cl, `insert into public.vocab_words (user_id, word, display) values ($1,'Bad Word','x')`, [a])).toMatch(/check/)
      expect(await expectError(cl, `insert into public.vocab_words (user_id, word, display) values ($1,'mitigate','again')`, [a])).toMatch(/duplicate/)
      expect(await expectError(cl, `insert into public.vocab_words (user_id, word, display, source) values ($1,'thrive','thrive','hack')`, [a])).toMatch(/check/)
    })
  })
})
