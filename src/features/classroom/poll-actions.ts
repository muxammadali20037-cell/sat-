'use server'

import type { ActionResult } from '@/lib/api/errors'
import { audit, Denied, must, refresh, row, run, staffFor } from './action-kit'
import { AnswerPollSchema, CreatePollSchema, PollRefSchema } from './polls'

/** Class polls and quick quizzes: staff create and close; students answer while a poll is open. */

export async function createPollAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async (ctx) => {
    const parsed = CreatePollSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    await staffFor(ctx, d.workspaceId, 'poll.manage', d.groupId)
    if (d.sessionId) {
      const s = must(await ctx.admin.from('class_sessions').select('group_id').eq('id', d.sessionId).eq('workspace_id', d.workspaceId).maybeSingle())
      if (!s || s.group_id !== d.groupId) throw new Denied('notFound')
    }
    const created = row(
      await ctx.admin
        .from('class_polls')
        .insert({
          workspace_id: d.workspaceId,
          group_id: d.groupId,
          session_id: d.sessionId,
          kind: d.kind,
          question: d.question,
          options: d.options,
          correct_index: d.kind === 'quiz' ? d.correctIndex : null,
          created_by: ctx.profile.id,
        })
        .select('id')
        .single(),
    )
    await audit(ctx, d.workspaceId, 'poll.create', 'class_poll', created.id, { kind: d.kind, group_id: d.groupId })
    refresh(d.workspaceId)
    return { ok: true, data: { id: created.id }, message: ctx.t.teach.polls.created }
  })
}

export async function closePollAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = PollRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const p = must(await ctx.admin.from('class_polls').select('id, workspace_id, group_id, status').eq('id', parsed.data.pollId).maybeSingle())
    if (!p) throw new Denied('notFound')
    await staffFor(ctx, p.workspace_id, 'poll.manage', p.group_id)
    if (p.status === 'open') must(await ctx.admin.from('class_polls').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', p.id))
    await audit(ctx, p.workspace_id, 'poll.close', 'class_poll', p.id)
    refresh(p.workspace_id)
    return { ok: true, message: ctx.t.teach.polls.closedToast }
  })
}

export async function answerPollAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = AnswerPollSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const p = must(await ctx.admin.from('class_polls').select('id, workspace_id, group_id, status, options').eq('id', parsed.data.pollId).maybeSingle())
    if (!p) throw new Denied('notFound')
    const member = must(
      await ctx.admin.from('group_members').select('user_id').eq('group_id', p.group_id).eq('user_id', ctx.profile.id).eq('role', 'student').is('left_at', null).maybeSingle(),
    )
    if (!member) throw new Denied('notFound')
    if (p.status !== 'open') throw new Denied('closed')
    if (parsed.data.choice >= p.options.length) throw new Denied('checkFields')
    must(
      await ctx.admin
        .from('class_poll_answers')
        .upsert(
          { workspace_id: p.workspace_id, poll_id: p.id, student_id: ctx.profile.id, choice: parsed.data.choice, answered_at: new Date().toISOString() },
          { onConflict: 'poll_id,student_id' },
        ),
    )
    refresh(p.workspace_id)
    return { ok: true, message: ctx.t.classes.pollAnswered }
  })
}
