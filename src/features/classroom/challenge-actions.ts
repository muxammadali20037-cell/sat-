'use server'

import type { ActionResult } from '@/lib/api/errors'
import { audit, Denied, must, refresh, row, run, staffFor } from './action-kit'
import { getMembership } from './server'
import { ChallengeRefSchema, CreateChallengeSchema, LeaderboardOptInSchema } from './challenges'

export async function createChallengeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async (ctx) => {
    const parsed = CreateChallengeSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    await staffFor(ctx, d.workspaceId, 'challenge.manage', d.groupId)
    const created = row(
      await ctx.admin
        .from('class_challenges')
        .insert({ workspace_id: d.workspaceId, group_id: d.groupId, title: d.title, metric: d.metric, mode: d.mode, target: d.target, starts_on: d.startsOn, ends_on: d.endsOn, created_by: ctx.profile.id })
        .select('id')
        .single(),
    )
    await audit(ctx, d.workspaceId, 'challenge.create', 'class_challenge', created.id, { metric: d.metric, mode: d.mode, target: d.target })
    refresh(d.workspaceId)
    return { ok: true, data: { id: created.id }, message: ctx.t.teach.challenges.created }
  })
}

export async function endChallengeAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = ChallengeRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const c = must(await ctx.admin.from('class_challenges').select('id, workspace_id, group_id, status').eq('id', parsed.data.challengeId).maybeSingle())
    if (!c) throw new Denied('notFound')
    await staffFor(ctx, c.workspace_id, 'challenge.manage', c.group_id)
    if (c.status === 'active') must(await ctx.admin.from('class_challenges').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', c.id))
    await audit(ctx, c.workspace_id, 'challenge.end', 'class_challenge', c.id)
    refresh(c.workspace_id)
    return { ok: true, message: ctx.t.teach.challenges.ended }
  })
}

/** A student shows or hides their weekly effort on their groups' leaderboards (their choice only). */
export async function setLeaderboardOptInAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = LeaderboardOptInSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const m = await getMembership(ctx.admin, ctx.profile.id, parsed.data.workspaceId)
    if (!m || m.role !== 'student') throw new Denied('notFound')
    must(await ctx.admin.from('workspace_members').update({ leaderboard_opt_in: parsed.data.enabled }).eq('workspace_id', parsed.data.workspaceId).eq('user_id', ctx.profile.id))
    await audit(ctx, parsed.data.workspaceId, parsed.data.enabled ? 'leaderboard.opt_in' : 'leaderboard.opt_out', 'workspace_member', ctx.profile.id)
    refresh(parsed.data.workspaceId)
    return { ok: true, message: parsed.data.enabled ? ctx.t.classes.leaderboardOn : ctx.t.classes.leaderboardOff }
  })
}
