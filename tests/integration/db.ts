/**
 * Integration-test helpers: a real Postgres with the Supabase shim + all migrations
 * (`npm run db:start && npm run db:reset`). Impersonation mirrors PostgREST: switch to the
 * `authenticated`/`anon`/`service_role` role and set request.jwt.claims for auth.uid().
 */
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

export const DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/satmaster_test'

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL })
  await client.connect()
  return client
}

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'CONTENT_EDITOR' | 'TEACHER' | 'STUDENT'

/** Creates an auth user (trigger creates the profile) and optionally sets a role. Returns the user id. */
export async function createUser(c: Client, opts: { role?: Role; fullName?: string; email?: string } = {}): Promise<string> {
  const id = randomUUID()
  const email = opts.email ?? `test-${id.slice(0, 8)}@example.test`
  await c.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ full_name: opts.fullName ?? 'Test User' }),
  ])
  if (opts.role && opts.role !== 'STUDENT') {
    await c.query(`update public.profiles set role = $2 where id = $1`, [id, opts.role])
  }
  return id
}

type Impersonation = { kind: 'user'; userId: string } | { kind: 'anon' } | { kind: 'service' }

/**
 * Runs `fn` inside a transaction as the given identity and ROLLS BACK afterwards, so tests
 * never leak state. Errors inside `fn` propagate after rollback.
 */
export async function withIdentity<T>(c: Client, who: Impersonation, fn: (c: Client) => Promise<T>): Promise<T> {
  await c.query('begin')
  try {
    if (who.kind === 'user') {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.userId, role: 'authenticated' })])
      await c.query('set local role authenticated')
    } else if (who.kind === 'anon') {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'anon' })])
      await c.query('set local role anon')
    } else {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'service_role' })])
      await c.query('set local role service_role')
    }
    return await fn(c)
  } finally {
    await c.query('rollback')
  }
}

export const asUser = <T>(c: Client, userId: string, fn: (c: Client) => Promise<T>) => withIdentity(c, { kind: 'user', userId }, fn)
export const asAnon = <T>(c: Client, fn: (c: Client) => Promise<T>) => withIdentity(c, { kind: 'anon' }, fn)
export const asService = <T>(c: Client, fn: (c: Client) => Promise<T>) => withIdentity(c, { kind: 'service' }, fn)

/** Expect a statement to fail; returns the Postgres error message. Uses a savepoint so the outer transaction survives. */
export async function expectError(c: Client, sql: string, params: unknown[] = []): Promise<string> {
  await c.query('savepoint expect_error')
  try {
    await c.query(sql, params)
  } catch (err) {
    await c.query('rollback to savepoint expect_error')
    return (err as Error).message
  }
  await c.query('release savepoint expect_error')
  throw new Error(`Expected statement to fail: ${sql}`)
}

/** Ids of reference rows, e.g. await ref(c, 'skills', 'linear_functions'). */
export async function refId(c: Client, table: 'subjects' | 'domains' | 'skills' | 'plans', code: string): Promise<string> {
  const { rows } = await c.query(`select id from public.${table} where code = $1`, [code])
  if (!rows[0]) throw new Error(`${table}.${code} not found — did you run npm run db:reset?`)
  return rows[0].id as string
}

/** Inserts a complete published multiple-choice question (as superuser) and returns ids. */
export async function createPublishedQuestion(
  c: Client,
  opts: { skillCode?: string; reviewerId: string; difficulty?: 'easy' | 'medium' | 'hard' },
): Promise<{ questionId: string; correctOptionId: string; wrongOptionId: string }> {
  const { rows } = await c.query(
    `select s.id as skill_id, d.id as domain_id, d.subject_id from public.skills s join public.domains d on d.id = s.domain_id where s.code = $1`,
    [opts.skillCode ?? 'linear_functions'],
  )
  const t = rows[0]
  const q = await c.query(
    `insert into public.questions (subject_id, domain_id, skill_id, difficulty, question_type, stem, status)
     values ($1, $2, $3, $4, 'multiple_choice', 'What is 2 + 2?', 'draft') returning id`,
    [t.subject_id, t.domain_id, t.skill_id, opts.difficulty ?? 'easy'],
  )
  const questionId = q.rows[0].id as string
  const opts4 = await c.query(
    `insert into public.answer_options (question_id, label, content, is_correct, position)
     values ($1,'A','3',false,1), ($1,'B','4',true,2), ($1,'C','5',false,3), ($1,'D','22',false,4) returning id, is_correct`,
    [questionId],
  )
  await c.query(`insert into public.question_explanations (question_id, locale, content) values ($1, 'en', '2 + 2 = 4.')`, [questionId])
  await c.query(`update public.questions set status = 'published', reviewed_by = $2, reviewed_at = now() where id = $1`, [questionId, opts.reviewerId])
  const correct = opts4.rows.find((r) => r.is_correct)!.id as string
  const wrong = opts4.rows.find((r) => !r.is_correct)!.id as string
  return { questionId, correctOptionId: correct, wrongOptionId: wrong }
}
