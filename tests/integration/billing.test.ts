/**
 * Billing SQL functions, delete protection and RLS — against the real migrations.
 * Every test runs in one transaction that is rolled back (withIdentity), so `now()` is constant
 * inside a test and period arithmetic can be asserted exactly.
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

/** Transaction as the superuser (fixtures); switch identities inside with the helpers below. */
const tx = <T>(fn: (c: Client) => Promise<T>) =>
  withIdentity(c, { kind: 'service' }, async (cl) => {
    await cl.query('reset role')
    return fn(cl)
  })

async function becomeStudent(cl: Client, userId: string) {
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await cl.query('set local role authenticated')
}
async function becomeService(cl: Client) {
  await cl.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'service_role' })])
  await cl.query('set local role service_role')
}
const becomeSuper = (cl: Client) => cl.query('reset role')

async function planPrice(cl: Client, code: string): Promise<bigint> {
  const { rows } = await cl.query(`select price_minor::text as p from public.plans where code = $1`, [code])
  return BigInt(rows[0].p)
}

async function newPayment(cl: Client, userId: string, planCode: string, provider = 'click'): Promise<string> {
  const { rows } = await cl.query(
    `insert into public.payments (user_id, plan_id, provider, amount_minor, currency, idempotency_key)
     select $1, p.id, $3, p.price_minor, 'UZS', gen_random_uuid()::text from public.plans p where p.code = $2
     returning id`,
    [userId, planCode, provider],
  )
  return rows[0].id as string
}

async function apply(cl: Client, paymentId: string, txId: string | null = null): Promise<string> {
  const { rows } = await cl.query(`select public.billing_apply_successful_payment($1, $2) as sub`, [paymentId, txId])
  return rows[0].sub as string
}

async function subscriptionFor(cl: Client, userId: string, extraEnd = `interval '10 days'`, planCode = 'starter', start = `now() - interval '20 days'`): Promise<string> {
  const { rows } = await cl.query(
    `insert into public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end, last_provider)
     select $1, p.id, 'active', ${start}, now() + ${extraEnd}, 'click' from public.plans p where p.code = $2 returning id`,
    [userId, planCode],
  )
  return rows[0].id as string
}

describe('billing_apply_successful_payment', () => {
  it('creates a one-month active subscription and marks the payment succeeded', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const payment = await newPayment(cl, user, 'starter')
      await becomeService(cl) // the server applies payments with the service role
      const sub = await apply(cl, payment, 'click-tx-1')
      await becomeSuper(cl)

      const s = await cl.query(
        `select s.status, p.code, s.last_provider,
                s.current_period_start = now() as starts_now,
                s.current_period_end = now() + interval '1 month' as ends_in_a_month
           from public.subscriptions s join public.plans p on p.id = s.plan_id where s.id = $1`,
        [sub],
      )
      expect(s.rows[0]).toEqual({ status: 'active', code: 'starter', last_provider: 'click', starts_now: true, ends_in_a_month: true })
      const p = await cl.query(`select status, subscription_id, provider_transaction_id, paid_at = now() as paid_now from public.payments where id = $1`, [payment])
      expect(p.rows[0]).toEqual({ status: 'succeeded', subscription_id: sub, provider_transaction_id: 'click-tx-1', paid_now: true })
      const ent = await cl.query(`select distinct plan_code, subscription_status from public.get_entitlements($1)`, [user])
      expect(ent.rows).toEqual([{ plan_code: 'starter', subscription_status: 'active' }])
      const audit = await cl.query(`select count(*)::int as n from public.audit_logs where action = 'billing.payment_applied' and entity_id = $1`, [payment])
      expect(audit.rows[0].n).toBe(1)
    }))

  it('renewal extends from the current period end (and from now during grace)', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const sub = await subscriptionFor(cl, user, `interval '10 days'`)
      const payment = await newPayment(cl, user, 'starter')
      expect(await apply(cl, payment)).toBe(sub)
      const r = await cl.query(
        `select current_period_end = (now() + interval '10 days') + interval '1 month' as extended,
                current_period_start = now() - interval '20 days' as start_kept
           from public.subscriptions where id = $1`,
        [sub],
      )
      expect(r.rows[0]).toEqual({ extended: true, start_kept: true })

      const graceUser = await createUser(cl)
      const graceSub = await subscriptionFor(cl, graceUser, `- interval '1 day'`, 'starter', `now() - interval '31 days'`)
      await apply(cl, await newPayment(cl, graceUser, 'starter'))
      const g = await cl.query(
        `select current_period_end = now() + interval '1 month' as from_now, current_period_start = now() as restarted from public.subscriptions where id = $1`,
        [graceSub],
      )
      expect(g.rows[0]).toEqual({ from_now: true, restarted: true })
    }))

  it('upgrade switches plan now and converts the remaining time pro-rata', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const sub = await subscriptionFor(cl, user, `interval '10 days'`, 'starter')
      const starter = await planPrice(cl, 'starter')
      const pro = await planPrice(cl, 'pro')
      // 10 days left on Starter, valued at the Starter price, bought as Pro time:
      const remaining = 10n * 86_400n
      const credit = (remaining * starter) / pro // floor, as in SQL
      expect(credit).toBe(429_829n) // 864000 s × 99 000 / 199 000 with the reference prices

      await apply(cl, await newPayment(cl, user, 'pro'))
      const r = await cl.query(
        `select p.code, s.current_period_start = now() as starts_now,
                s.current_period_end = now() + interval '1 month' + make_interval(secs => $2::double precision) as end_ok,
                extract(epoch from s.current_period_end - (now() + interval '1 month'))::bigint::text as credit_seconds
           from public.subscriptions s join public.plans p on p.id = s.plan_id where s.id = $1`,
        [sub, Number(credit)],
      )
      expect(r.rows[0]).toEqual({ code: 'pro', starts_now: true, end_ok: true, credit_seconds: credit.toString() })
    }))

  it('replaying an applied payment is idempotent', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const payment = await newPayment(cl, user, 'pro')
      const first = await apply(cl, payment, 'tx-a')
      const end1 = (await cl.query(`select current_period_end from public.subscriptions where id = $1`, [first])).rows[0].current_period_end
      const second = await apply(cl, payment, 'tx-a')
      expect(second).toBe(first)
      const end2 = (await cl.query(`select current_period_end from public.subscriptions where id = $1`, [first])).rows[0].current_period_end
      expect(end2).toEqual(end1)
      const n = await cl.query(
        `select (select count(*)::int from public.notifications where user_id = $1 and type = 'payment') as notes,
                (select count(*)::int from public.subscriptions where user_id = $1) as subs`,
        [user],
      )
      expect(n.rows[0]).toEqual({ notes: 1, subs: 1 })
    }))

  it('replaces a subscription that is past its grace period with a new one', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const old = await subscriptionFor(cl, user, `- interval '30 days'`, 'pro', `now() - interval '60 days'`)
      const fresh = await apply(cl, await newPayment(cl, user, 'starter'))
      expect(fresh).not.toBe(old)
      const r = await cl.query(`select id, status from public.subscriptions where user_id = $1 order by created_at, status`, [user])
      expect(Object.fromEntries(r.rows.map((x) => [x.id, x.status]))).toEqual({ [old]: 'expired', [fresh]: 'active' })
    }))

  it('refuses to apply a canceled payment; a failed one can still be applied', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const canceled = await newPayment(cl, user, 'starter')
      await cl.query(`select public.billing_cancel_pending_payment($1, 'abandoned')`, [canceled])
      expect(await expectError(cl, `select public.billing_apply_successful_payment($1)`, [canceled])).toMatch(/cannot be applied/)
      const failed = await newPayment(cl, user, 'starter')
      await cl.query(`select public.billing_mark_payment_failed($1, 'declined')`, [failed])
      await apply(cl, failed)
      expect((await cl.query(`select status from public.payments where id = $1`, [failed])).rows[0].status).toBe('succeeded')
    }))
})

describe('billing_refund_payment', () => {
  it('records the refund, revokes access when asked, and is idempotent', () =>
    tx(async (cl) => {
      const admin = await createUser(cl, { role: 'ADMIN' })
      const user = await createUser(cl)
      const payment = await newPayment(cl, user, 'starter')
      const sub = await apply(cl, payment)
      const price = await planPrice(cl, 'starter')

      expect(await expectError(cl, `select public.billing_refund_payment($1, $2, 'x', true, $3)`, [payment, (price + 1n).toString(), admin])).toMatch(
        /Invalid refund amount/,
      )
      await cl.query(`select public.billing_refund_payment($1, $2, 'Student request', true, $3)`, [payment, price.toString(), admin])
      await cl.query(`select public.billing_refund_payment($1, $2, 'Student request', true, $3)`, [payment, price.toString(), admin])

      const p = await cl.query(`select status, refund_amount_minor::text as amt, refund_reason from public.payments where id = $1`, [payment])
      expect(p.rows[0]).toEqual({ status: 'refunded', amt: price.toString(), refund_reason: 'Student request' })
      const s = await cl.query(`select status, canceled_at is not null as has_canceled_at from public.subscriptions where id = $1`, [sub])
      expect(s.rows[0]).toEqual({ status: 'canceled', has_canceled_at: true })
      const ent = await cl.query(`select distinct plan_code, subscription_status from public.get_entitlements($1)`, [user])
      expect(ent.rows).toEqual([{ plan_code: 'free', subscription_status: 'none' }])
      const audit = await cl.query(`select actor_id from public.audit_logs where action = 'billing.payment_refunded' and entity_id = $1`, [payment])
      expect(audit.rows).toEqual([{ actor_id: admin }])
    }))

  it('only refunds paid payments', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const payment = await newPayment(cl, user, 'starter')
      expect(await expectError(cl, `select public.billing_refund_payment($1, 100, 'x', false)`, [payment])).toMatch(/Only succeeded payments/)
    }))
})

describe('financial rows are permanent', () => {
  it('payments, payment_events and subscriptions cannot be deleted, even by service_role', () =>
    tx(async (cl) => {
      const user = await createUser(cl)
      const payment = await newPayment(cl, user, 'starter')
      const sub = await apply(cl, payment)
      await cl.query(
        `insert into public.payment_events (payment_id, provider, event_type, provider_event_id, signature_valid, payload)
         values ($1, 'click', 'complete', 'complete:1', true, '{}')`,
        [payment],
      )
      await becomeService(cl)
      expect(await expectError(cl, `delete from public.payments where id = $1`, [payment])).toMatch(/cannot be deleted/)
      expect(await expectError(cl, `delete from public.payment_events where payment_id = $1`, [payment])).toMatch(/cannot be deleted/)
      expect(await expectError(cl, `delete from public.subscriptions where id = $1`, [sub])).toMatch(/cannot be deleted/)
      // The unique provider event id is the webhook dedupe key.
      expect(
        await expectError(
          cl,
          `insert into public.payment_events (provider, event_type, provider_event_id, signature_valid, payload) values ('click', 'complete', 'complete:1', true, '{}')`,
        ),
      ).toMatch(/duplicate key/)
    }))
})

describe('billing RLS', () => {
  it('a student reads only their own payments and no provider events', () =>
    tx(async (cl) => {
      const a = await createUser(cl)
      const b = await createUser(cl)
      const pa = await newPayment(cl, a, 'starter')
      const pb = await newPayment(cl, b, 'pro')
      await cl.query(
        `insert into public.payment_events (payment_id, provider, event_type, provider_event_id, signature_valid, payload)
         values ($1, 'click', 'prepare', 'prepare:rls', true, '{}')`,
        [pa],
      )
      await becomeStudent(cl, a)
      const own = await cl.query(`select id from public.payments`)
      expect(own.rows.map((r) => r.id)).toEqual([pa])
      expect((await cl.query(`select id from public.payments where id = $1`, [pb])).rows).toEqual([])
      expect((await cl.query(`select id from public.payment_events`)).rows).toEqual([])
    }))

  it('a student cannot insert or update payments or subscriptions, or call billing functions', () =>
    tx(async (cl) => {
      const a = await createUser(cl)
      const sub = await subscriptionFor(cl, a)
      const payment = await newPayment(cl, a, 'starter')
      const { rows } = await cl.query(`select id from public.plans where code = 'premium'`)
      const premium = rows[0].id as string
      await becomeStudent(cl, a)
      expect(
        await expectError(
          cl,
          `insert into public.payments (user_id, plan_id, provider, status, amount_minor, currency, idempotency_key)
           values ($1, $2, 'click', 'succeeded', 100, 'UZS', 'student-forged-1')`,
          [a, premium],
        ),
      ).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.payments set status = 'succeeded' where id = $1`, [payment])).toMatch(/permission denied/)
      expect(
        await expectError(
          cl,
          `insert into public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end) values ($1, $2, 'active', now(), now() + interval '1 year')`,
          [a, premium],
        ),
      ).toMatch(/permission denied/)
      expect(await expectError(cl, `update public.subscriptions set current_period_end = now() + interval '5 years', plan_id = $2 where id = $1`, [sub, premium])).toMatch(
        /permission denied/,
      )
      expect(await expectError(cl, `select public.billing_apply_successful_payment($1)`, [payment])).toMatch(/permission denied/)
      expect(await expectError(cl, `select public.billing_refund_payment($1, 1, 'x', true)`, [payment])).toMatch(/permission denied/)
    }))
})
