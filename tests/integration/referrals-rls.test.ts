/**
 * Migration 0032: a student sees only their own invite code and the invites they sent or came
 * through; no client can write either table; invites are never deleted; constraints hold.
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

describe('referrals (0032)', () => {
  it('own rows only, no client writes, no deletes, constraints', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      const b = await createUser(cl)
      const other = await createUser(cl)
      await cl.query(`insert into public.referral_codes (user_id, code) values ($1, 'abcd2345'), ($2, 'wxyz6789')`, [a, other])
      const r = (await cl.query(`insert into public.referrals (referrer_id, referred_id, code) values ($1, $2, 'abcd2345') returning id`, [a, b])).rows[0].id

      await become(cl, a)
      expect(await n(cl, 'select count(*) n from public.referral_codes')).toBe(1)
      expect(await n(cl, 'select count(*) n from public.referrals')).toBe(1)
      await become(cl, b)
      expect(await n(cl, 'select count(*) n from public.referrals')).toBe(1)
      expect(await n(cl, 'select count(*) n from public.referral_codes')).toBe(0)
      await become(cl, other)
      expect(await n(cl, 'select count(*) n from public.referrals')).toBe(0)
      expect(await n(cl, 'select count(*) n from public.referral_codes')).toBe(1)

      for (const who of [a, b]) {
        await become(cl, who)
        expect(await expectError(cl, `insert into public.referrals (referrer_id, referred_id, code) values ($1, $2, 'abcd2345')`, [a, other])).toMatch(/permission denied/)
        expect(await expectError(cl, `update public.referrals set status = 'rewarded', referrer_days = 366`)).toMatch(/permission denied/)
        expect(await expectError(cl, `insert into public.referral_codes (user_id, code) values ($1, 'qqqq2345')`, [who])).toMatch(/permission denied/)
      }

      await cl.query('reset role')
      expect(await expectError(cl, `delete from public.referrals where id = $1`, [r])).toMatch(/delet/i)
      expect(await expectError(cl, `insert into public.referrals (referrer_id, referred_id, code) values ($1, $1, 'x')`, [other])).toMatch(/check/i)
      expect(await expectError(cl, `insert into public.referrals (referrer_id, referred_id, code) values ($1, $2, 'x')`, [other, b])).toMatch(/duplicate|unique/i)
      expect(await expectError(cl, `insert into public.referral_codes (user_id, code) values ($1, 'BAD')`, [b])).toMatch(/check/i)
      expect(await expectError(cl, `update public.referrals set referrer_days = 400 where id = $1`, [r])).toMatch(/check/i)
      expect(await n(cl, `select count(*) n from public.platform_settings where key like 'referrals.%'`)).toBe(4)
      expect((await cl.query(`select value from public.platform_settings where key = 'referrals.referrer_days'`)).rows[0].value).toBe(0)
    })
  })
})
