/**
 * telegram_accounts (0016): only the server writes links; a student reads only their own row;
 * staff who may view students can read all; one Telegram user ↔ one account.
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
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await cl.query('set local role authenticated')
}

async function link(cl: Client, userId: string, telegramId: number, via = 'mini_app') {
  await cl.query(`insert into public.telegram_accounts (user_id, telegram_user_id, username, created_via) values ($1, $2::bigint, 'u' || $4, $3)`, [
    userId,
    telegramId,
    via,
    String(telegramId),
  ])
}

describe('telegram_accounts', () => {
  it('a student reads only their own link', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      const b = await createUser(cl)
      await link(cl, a, 9001)
      await link(cl, b, 9002, 'link')
      await become(cl, a)
      const { rows } = await cl.query('select telegram_user_id::text as id from public.telegram_accounts')
      expect(rows).toEqual([{ id: '9001' }])
    })
  })

  it('students cannot create, change or delete links (server only)', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      const b = await createUser(cl)
      await link(cl, b, 9102)
      await become(cl, a)
      expect(await expectError(cl, `insert into public.telegram_accounts (user_id, telegram_user_id, created_via) values ($1, 9101, 'link')`, [a])).toMatch(
        /permission denied/,
      )
      expect(await expectError(cl, `update public.telegram_accounts set user_id = $1 where telegram_user_id = 9102`, [a])).toMatch(/permission denied/)
      expect(await expectError(cl, `delete from public.telegram_accounts`)).toMatch(/permission denied/)
    })
  })

  it('platform admins read every link (0019 narrowed this from all staff); anonymous visitors read nothing', async () => {
    await tx(async (cl) => {
      const teacher = await createUser(cl, { role: 'ADMIN' })
      const s1 = await createUser(cl)
      const s2 = await createUser(cl)
      await link(cl, s1, 9201)
      await link(cl, s2, 9202)
      await become(cl, teacher)
      const { rows } = await cl.query('select count(*)::int as n from public.telegram_accounts where telegram_user_id in (9201, 9202)')
      expect(rows[0].n).toBe(2)
    })
    await asAnon(c, async (cl) => {
      expect(await expectError(cl, 'select * from public.telegram_accounts')).toMatch(/permission denied/)
    })
  })

  it('one Telegram user per account and one account per Telegram user', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      const b = await createUser(cl)
      await link(cl, a, 9301)
      expect(await expectError(cl, `insert into public.telegram_accounts (user_id, telegram_user_id, created_via) values ($1, 9301, 'link')`, [b])).toMatch(
        /duplicate key/,
      )
      expect(await expectError(cl, `insert into public.telegram_accounts (user_id, telegram_user_id, created_via) values ($1, 9302, 'link')`, [a])).toMatch(
        /duplicate key/,
      )
      expect(await expectError(cl, `insert into public.telegram_accounts (user_id, telegram_user_id, created_via) values ($1, 9303, 'other')`, [b])).toMatch(
        /check constraint/,
      )
    })
  })

  it('deleting the account removes its Telegram link', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      await link(cl, a, 9401)
      await cl.query('delete from auth.users where id = $1', [a])
      const { rows } = await cl.query('select count(*)::int as n from public.telegram_accounts where telegram_user_id = 9401')
      expect(rows[0].n).toBe(0)
    })
  })

  it('website sign-in requests are invisible to students and visitors', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      await cl.query(
        `insert into public.telegram_login_requests (token_hash, browser_hash, intent, code) values (repeat('a', 64), repeat('b', 64), 'sign_in', '1234')`,
      )
      await become(cl, a)
      expect(await expectError(cl, 'select * from public.telegram_login_requests')).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.telegram_login_requests set status = 'approved'`)).toMatch(/permission denied/)
    })
    await asAnon(c, async (cl) => {
      expect(await expectError(cl, 'select * from public.telegram_login_requests')).toMatch(/permission denied/)
    })
  })

  it('validates requests and shared phone numbers', async () => {
    await tx(async (cl) => {
      const a = await createUser(cl)
      expect(
        await expectError(cl, `insert into public.telegram_login_requests (token_hash, browser_hash, intent, code) values (repeat('c', 64), repeat('d', 64), 'link', '1234')`),
      ).toMatch(/check constraint/)
      expect(
        await expectError(cl, `insert into public.telegram_login_requests (token_hash, browser_hash, intent, code) values (repeat('e', 64), repeat('f', 64), 'sign_in', '12a4')`),
      ).toMatch(/check constraint/)
      await link(cl, a, 9501)
      await cl.query(`update public.telegram_accounts set phone_number = '+998901234567' where user_id = $1`, [a])
      expect(await expectError(cl, `update public.telegram_accounts set phone_number = '998901234567' where user_id = $1`, [a])).toMatch(/check constraint/)
    })
  })
})

