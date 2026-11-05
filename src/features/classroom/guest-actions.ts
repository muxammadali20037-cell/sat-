'use server'

import { z } from 'zod'
import type { ActionResult } from '@/lib/api/errors'
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/security/rate-limit'
import { writeAudit } from '@/lib/audit'
import { audit, Denied, must, refresh, row, run, staffFor } from './action-kit'
import { generateCode, normalizeCode } from './codes'
import { liveWindow } from './lessons'

/**
 * Guest teachers and moderators for one lesson. A guest link lets a signed-in person into that
 * lesson's live room only: no workspace membership, no student data.
 */

const id = z.guid()
const CreateGuestLinkSchema = z.object({ workspaceId: id, sessionId: id, role: z.enum(['guest_teacher', 'moderator']), maxUses: z.number().int().min(1).max(20).default(1) })
const GuestLinkRefSchema = z.object({ workspaceId: id, linkId: id })
const AcceptSchema = z.object({ code: z.string().max(20) })

export async function createGuestLinkAction(input: unknown): Promise<ActionResult<{ code: string }>> {
  return run(async (ctx) => {
    const parsed = CreateGuestLinkSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    const s = must(await ctx.admin.from('class_sessions').select('id, group_id, status').eq('id', d.sessionId).eq('workspace_id', d.workspaceId).maybeSingle())
    if (!s) throw new Denied('notFound')
    await staffFor(ctx, d.workspaceId, 'session.manage', s.group_id)
    if (s.status === 'cancelled') throw new Denied('closed')
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode()
      const res = await ctx.admin
        .from('class_session_guest_links')
        .insert({ workspace_id: d.workspaceId, session_id: s.id, code, role: d.role, max_uses: d.maxUses, created_by: ctx.profile.id })
        .select('id')
        .single()
      if (res.error?.code === '23505') continue // code collision: try another
      const created = row(res)
      await audit(ctx, d.workspaceId, 'guest_link.create', 'class_session', s.id, { link_id: created.id, role: d.role, max_uses: d.maxUses })
      refresh(d.workspaceId)
      return { ok: true, data: { code }, message: ctx.t.teach.guests.created }
    }
    throw new Error('could not generate a unique guest code')
  })
}

export async function revokeGuestLinkAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = GuestLinkRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const link = must(
      await ctx.admin.from('class_session_guest_links').select('id, session_id, class_sessions!inner(group_id)').eq('id', parsed.data.linkId).eq('workspace_id', parsed.data.workspaceId).maybeSingle(),
    )
    if (!link) throw new Denied('notFound')
    await staffFor(ctx, parsed.data.workspaceId, 'session.manage', (link.class_sessions as unknown as { group_id: string }).group_id)
    must(await ctx.admin.from('class_session_guest_links').update({ revoked_at: new Date().toISOString() }).eq('id', link.id).is('revoked_at', null))
    await audit(ctx, parsed.data.workspaceId, 'guest_link.revoke', 'class_session', link.session_id, { link_id: link.id })
    refresh(parsed.data.workspaceId)
    return { ok: true, message: ctx.t.teach.guests.revoked }
  })
}

/** A signed-in person uses a guest link; returns the lesson to open. */
export async function acceptGuestLinkAction(input: unknown): Promise<ActionResult<{ sessionId: string }>> {
  return run(async (ctx) => {
    const parsed = AcceptSchema.safeParse(input)
    const code = parsed.success ? normalizeCode(parsed.data.code) : null
    const [byUser, byIp] = await Promise.all([
      checkRateLimit(RATE_LIMITS.classroomJoin, `u:${ctx.profile.id}`),
      checkRateLimit(RATE_LIMITS.classroomJoin, `ip:${await clientIp()}`),
    ])
    if (!byUser.allowed || !byIp.allowed) throw new Denied('rateLimited')
    if (!code) throw new Denied('invalidCode')
    const link = must(
      await ctx.admin
        .from('class_session_guest_links')
        .select('id, workspace_id, session_id, role, max_uses, uses, revoked_at, class_sessions!inner(status, starts_at, duration_minutes)')
        .eq('code', code)
        .maybeSingle(),
    )
    if (!link) throw new Denied('inviteNotFound')
    const s = link.class_sessions as unknown as { status: string; starts_at: string; duration_minutes: number }
    if (link.revoked_at || s.status === 'cancelled' || liveWindow(s.starts_at, s.duration_minutes, new Date()) === 'closed') throw new Denied('inviteExpired')
    const existing = must(await ctx.admin.from('class_session_guests').select('user_id').eq('session_id', link.session_id).eq('user_id', ctx.profile.id).maybeSingle())
    if (!existing) {
      // Take one use atomically: only succeeds while uses < max_uses.
      const taken = must(
        await ctx.admin.from('class_session_guest_links').update({ uses: link.uses + 1 }).eq('id', link.id).eq('uses', link.uses).lt('uses', link.max_uses).select('id'),
      )
      if (!taken?.length) throw new Denied('inviteUsedUp')
      must(
        await ctx.admin
          .from('class_session_guests')
          .upsert({ workspace_id: link.workspace_id, session_id: link.session_id, user_id: ctx.profile.id, link_id: link.id, role: link.role }, { onConflict: 'session_id,user_id', ignoreDuplicates: true }),
      )
      await writeAudit({ actorId: ctx.profile.id, actorRole: ctx.profile.role, action: 'guest_link.accept', entityType: 'class_session', entityId: link.session_id, workspaceId: link.workspace_id, after: { link_id: link.id, role: link.role } })
    }
    return { ok: true, data: { sessionId: link.session_id } }
  })
}
