import 'server-only'
import { revalidatePath } from 'next/cache'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { getApiContext, type CurrentProfile } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/audit'
import { getDict } from '@/lib/i18n/server'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import type { Db } from '@/lib/supabase/server'
import { can, isManagerRole, type Action } from './permissions'
import { getMembership, teachableGroupIds, type Membership } from './server'

/** Shared plumbing for classroom server actions (not itself a server-action module). */

export type T = (typeof classroomDict)['en']
export type Ctx = { profile: CurrentProfile; admin: Db; t: T }

export class Denied extends Error {
  constructor(readonly key: keyof T['errors']) {
    super(key)
  }
}

export async function run<R>(fn: (ctx: Ctx) => Promise<ActionResult<R>>): Promise<ActionResult<R>> {
  const t = await getDict(classroomDict)
  try {
    const { profile } = await getApiContext()
    return await fn({ profile, admin: createAdminSupabase(), t })
  } catch (err) {
    if (err instanceof Denied) return { ok: false, error: t.errors[err.key] }
    if (err instanceof ApiError) {
      if (err.status === 401 || err.status === 403) return { ok: false, error: err.message }
      const reason = (err.details as { reason?: string } | undefined)?.reason
      if (reason === 'no_questions') return { ok: false, error: t.errors.noQuestions }
      return { ok: false, error: err.message }
    }
    console.error('[classroom] action failed', err)
    return { ok: false, error: t.errors.generic }
  }
}

export const must = <V>(res: { data: V; error: unknown }): V => {
  if (res.error) throw res.error
  return res.data
}
/** For `.single()` reads and inserts: the row must exist. */
export const row = <V>(res: { data: V; error: unknown }): NonNullable<V> => {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('expected a row')
  return res.data as NonNullable<V>
}

export async function staffFor(ctx: Ctx, workspaceId: string, action: Action, groupId?: string): Promise<Membership> {
  const m = await getMembership(ctx.admin, ctx.profile.id, workspaceId)
  if (!m) throw new Denied('notFound')
  let teachesGroup = false
  if (groupId) {
    const g = must(await ctx.admin.from('groups').select('id, status').eq('id', groupId).eq('workspace_id', workspaceId).maybeSingle())
    if (!g || g.status !== 'active') throw new Denied('notFound')
    teachesGroup = (await teachableGroupIds(ctx.admin, m, ctx.profile.id)).has(groupId)
    if (!teachesGroup && !isManagerRole(m.role)) throw new Denied('notFound')
  }
  if (!can(m.role, action, { teachesGroup })) throw new Denied('forbidden')
  return m
}

export const audit = (ctx: Ctx, workspaceId: string, action: string, entityType: string, entityId: string, after?: Record<string, unknown>) =>
  writeAudit({ actorId: ctx.profile.id, actorRole: ctx.profile.role, action, entityType, entityId, workspaceId, after: (after ?? null) as never })

export const refresh = (workspaceId?: string) => {
  revalidatePath('/teach', 'layout')
  revalidatePath('/dashboard/classes', 'layout')
  if (workspaceId) revalidatePath(`/teach/${workspaceId}`, 'layout')
}

