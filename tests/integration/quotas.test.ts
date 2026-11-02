/**
 * Atomic quota functions (0015): the daily AI limit and the monthly mock-exam limit must hold
 * under parallel requests.
 * The concurrency test uses separate, committed connections (a rolled-back transaction cannot show
 * a race), so it creates its own user and removes it afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { asService, asUser, connect, createUser, expectError, withIdentity } from './db'

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

async function reserve(cl: Client, userId: string, limit: number, since = "now() - interval '1 day'") {
  const { rows } = await cl.query(`select reservation_id, used from public.ai_reserve_request($1, ${since}, $2)`, [userId, limit])
  return rows[0] as { reservation_id: string | null; used: number }
}

async function usage(cl: Client, userId: string, endpoint: string, status: string, ago = '1 minute') {
  await cl.query(
    `insert into public.ai_usage (user_id, endpoint, model, status, created_at) values ($1, $2, 'test-model', $3, now() - $4::interval)`,
    [userId, endpoint, status, ago],
  )
}

describe('ai_reserve_request', () => {
  it('counts successful student requests and in-flight reservations, and refuses at the limit', async () => {
    await tx(async (cl) => {
      const u = await createUser(cl)
      await usage(cl, u, 'chat', 'ok')
      await usage(cl, u, 'hint', 'ok')
      await usage(cl, u, 'chat', 'error') // failures do not count
      await usage(cl, u, 'verify_practice', 'ok') // internal check, not a student request
      await usage(cl, u, 'chat', 'ok', '2 days') // before the window
      await cl.query("set local role service_role")
      const first = await reserve(cl, u, 3)
      expect(first.used).toBe(2)
      expect(first.reservation_id).toBeTruthy()
      const second = await reserve(cl, u, 3)
      expect(second.used).toBe(3)
      expect(second.reservation_id).toBeNull()
    })
  })

  it('releasing a reservation frees the unit; abandoned reservations expire after 10 minutes', async () => {
    await tx(async (cl) => {
      const u = await createUser(cl)
      await cl.query("set local role service_role")
      const r = await reserve(cl, u, 1)
      expect(r.reservation_id).toBeTruthy()
      expect((await reserve(cl, u, 1)).reservation_id).toBeNull()
      await cl.query('delete from public.ai_quota_reservations where id = $1', [r.reservation_id])
      const again = await reserve(cl, u, 1)
      expect(again.reservation_id).toBeTruthy()
      await cl.query(`update public.ai_quota_reservations set created_at = now() - interval '11 minutes' where user_id = $1`, [u])
      expect((await reserve(cl, u, 1)).reservation_id).toBeTruthy()
      const { rows } = await cl.query('select count(*)::int as n from public.ai_quota_reservations where user_id = $1', [u])
      expect(rows[0].n).toBe(1)
    })
  })

  it('rejects invalid arguments', async () => {
    await asService(c, async (cl) => {
      const msg = await expectError(cl, `select * from public.ai_reserve_request(gen_random_uuid(), now(), -1)`)
      expect(msg).toMatch(/invalid arguments/)
    })
  })

  it('students and anonymous visitors cannot call it or read reservations', async () => {
    const u = await tx(async (cl) => createUser(cl)) // rolled back; the id is only used as an argument
    await asUser(c, u, async (cl) => {
      expect(await expectError(cl, `select * from public.ai_reserve_request($1, now(), 100)`, [u])).toMatch(/permission denied/)
      expect(await expectError(cl, `select * from public.ai_quota_reservations`)).toMatch(/permission denied/)
    })
  })

  it('parallel requests cannot exceed the limit', async () => {
    const setup = await connect()
    const userId = await createUser(setup)
    const clients = await Promise.all(Array.from({ length: 8 }, () => connect()))
    try {
      const results = await Promise.all(
        clients.map(async (cl) => {
          await cl.query('begin')
          await cl.query('set local role service_role')
          const r = await reserve(cl, userId, 3)
          // Hold the transaction open briefly so the calls genuinely overlap.
          await cl.query('select pg_sleep(0.05)')
          await cl.query('commit')
          return r.reservation_id
        }),
      )
      expect(results.filter(Boolean)).toHaveLength(3)
      const { rows } = await setup.query('select count(*)::int as n from public.ai_quota_reservations where user_id = $1', [userId])
      expect(rows[0].n).toBe(3)
    } finally {
      await Promise.all(clients.map((cl) => cl.end()))
      await setup.query('delete from auth.users where id = $1', [userId])
      await setup.end()
    }
  })
})

describe('mock_exam_start_attempt', () => {
  async function exam(cl: Client, slug: string) {
    const { rows } = await cl.query(`insert into public.mock_exams (slug, title, status) values ($1, 'Quota test exam', 'published') returning id`, [slug])
    return rows[0].id as string
  }
  const start = (cl: Client, u: string, e: string, limit: number | null) =>
    cl.query(`select public.mock_exam_start_attempt($1, $2, now() - interval '30 days', $3) as id`, [u, e, limit]).then((r) => r.rows[0].id as string | null)

  it('counts non-abandoned attempts this month and refuses at the limit; null limit is unlimited', async () => {
    await tx(async (cl) => {
      const u = await createUser(cl)
      const [a, b, d] = [await exam(cl, 'quota-a'), await exam(cl, 'quota-b'), await exam(cl, 'quota-d')]
      await cl.query("set local role service_role")
      expect(await start(cl, u, a, 2)).toBeTruthy()
      await cl.query(`update public.attempts set status = 'abandoned' where user_id = $1`, [u]) // abandoned ones do not count
      expect(await start(cl, u, a, 2)).toBeTruthy()
      expect(await start(cl, u, b, 2)).toBeTruthy()
      expect(await start(cl, u, d, 2)).toBeNull()
      expect(await start(cl, u, d, null)).toBeTruthy()
    })
  })

  it('students cannot call it', async () => {
    const u = await tx(async (cl) => createUser(cl))
    await asUser(c, u, async (cl) => {
      expect(await expectError(cl, `select public.mock_exam_start_attempt($1, gen_random_uuid(), now(), 5)`, [u])).toMatch(/permission denied/)
    })
  })

  it('different exams started in parallel cannot exceed the monthly limit', async () => {
    const setup = await connect()
    const userId = await createUser(setup)
    const exams: string[] = []
    for (let i = 0; i < 6; i++) exams.push(await exam(setup, `quota-par-${userId.slice(0, 8)}-${i}`))
    const clients = await Promise.all(exams.map(() => connect()))
    try {
      const results = await Promise.all(
        clients.map(async (cl, i) => {
          await cl.query('begin')
          await cl.query('set local role service_role')
          const id = await start(cl, userId, exams[i]!, 1)
          await cl.query('select pg_sleep(0.05)')
          await cl.query('commit')
          return id
        }),
      )
      expect(results.filter(Boolean)).toHaveLength(1)
    } finally {
      await Promise.all(clients.map((cl) => cl.end()))
      await setup.query('delete from auth.users where id = $1', [userId])
      await setup.query('delete from public.mock_exams where id = any($1::uuid[])', [exams])
      await setup.end()
    }
  })

  it('the same exam started twice in parallel yields one attempt and a unique violation', async () => {
    const setup = await connect()
    const userId = await createUser(setup)
    const e = await exam(setup, `quota-same-${userId.slice(0, 8)}`)
    const clients = await Promise.all([connect(), connect()])
    try {
      const results = await Promise.allSettled(
        clients.map(async (cl) => {
          await cl.query('begin')
          await cl.query('set local role service_role')
          try {
            const id = await start(cl, userId, e, null)
            await cl.query('commit')
            return id
          } catch (err) {
            await cl.query('rollback')
            throw err
          }
        }),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect((rejected.reason as { code?: string }).code).toBe('23505')
    } finally {
      await Promise.all(clients.map((cl) => cl.end()))
      await setup.query('delete from auth.users where id = $1', [userId])
      await setup.query('delete from public.mock_exams where id = $1', [e])
      await setup.end()
    }
  })
})
