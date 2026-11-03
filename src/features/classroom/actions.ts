'use server'

import { revalidatePath } from 'next/cache'
import { ApiError, type ActionResult } from '@/lib/api/errors'
import { getApiContext, type CurrentProfile } from '@/lib/auth/session'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/audit'
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/security/rate-limit'
import { getDict } from '@/lib/i18n/server'
import { format, resolveDict } from '@/lib/i18n/dict'
import { isLocale } from '@/lib/i18n/config'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import { getTaxonomy } from '@/features/taxonomy/server'
import { startPractice } from '@/features/practice/server'
import type { Db } from '@/lib/supabase/server'
import { can, invitableRoles, isManagerRole, type Action } from './permissions'
import { generateCode, normalizeCode } from './codes'
import { assignmentById, getMembership, teachableGroupIds, type Membership } from './server'
import {
  AssignmentRefSchema,
  CreateAssignmentSchema,
  CreateGroupSchema,
  CreateInvitationSchema,
  CreateWorkspaceSchema,
  GradeSchema,
  GroupRefSchema,
  JoinSchema,
  RemoveMemberSchema,
  RemoveStudentSchema,
  RevokeInvitationSchema,
  SharingSchema,
  StartAssignmentSchema,
  SubmitTextSchema,
  type PracticeConfig,
} from './schemas'

/**
 * Classroom server actions. Each one: authenticates, validates input with zod, loads the actor's
 * workspace role, checks it with `can()`, then writes with the service role and records an audit
 * entry. A workspace/group/assignment the actor cannot reach is "not found".
 */

type T = (typeof classroomDict)['en']
type Ctx = { profile: CurrentProfile; admin: Db; t: T }

class Denied extends Error {
  constructor(readonly key: keyof T['errors']) {
    super(key)
  }
}

async function run<R>(fn: (ctx: Ctx) => Promise<ActionResult<R>>): Promise<ActionResult<R>> {
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

const must = <V>(res: { data: V; error: unknown }): V => {
  if (res.error) throw res.error
  return res.data
}
/** For `.single()` reads and inserts: the row must exist. */
const row = <V>(res: { data: V; error: unknown }): NonNullable<V> => {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('expected a row')
  return res.data as NonNullable<V>
}

async function staffFor(ctx: Ctx, workspaceId: string, action: Action, groupId?: string): Promise<Membership> {
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

const audit = (ctx: Ctx, workspaceId: string, action: string, entityType: string, entityId: string, after?: Record<string, unknown>) =>
  writeAudit({ actorId: ctx.profile.id, actorRole: ctx.profile.role, action, entityType, entityId, workspaceId, after: (after ?? null) as never })

const refresh = (workspaceId?: string) => {
  revalidatePath('/teach', 'layout')
  revalidatePath('/dashboard/classes', 'layout')
  if (workspaceId) revalidatePath(`/teach/${workspaceId}`, 'layout')
}

// ---------------------------------------------------------------------------
// Workspaces and groups
// ---------------------------------------------------------------------------

export async function createWorkspaceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async (ctx) => {
    const parsed = CreateWorkspaceSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const { data, error } = await ctx.admin.rpc('workspace_create', {
      p_owner: ctx.profile.id,
      p_name: parsed.data.name,
      p_kind: parsed.data.kind,
      p_country: ctx.profile.countryCode as string, // null is allowed by the function
      p_timezone: ctx.profile.timezone || 'Asia/Tashkent',
    })
    if (error) {
      if (/workspace limit/.test(error.message)) throw new Denied('workspaceLimit')
      throw error
    }
    const id = data as string
    await audit(ctx, id, 'workspace.create', 'workspace', id, { name: parsed.data.name, kind: parsed.data.kind })
    refresh()
    return { ok: true, data: { id }, message: ctx.t.teach.home.created }
  })
}

export async function createGroupAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async (ctx) => {
    const parsed = CreateGroupSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    await staffFor(ctx, d.workspaceId, 'group.create')
    const group = row(
      await ctx.admin.from('groups').insert({ workspace_id: d.workspaceId, name: d.name, subject: d.subject, created_by: ctx.profile.id }).select('id').single(),
    )
    // The creator teaches the group.
    must(await ctx.admin.from('group_members').insert({ workspace_id: d.workspaceId, group_id: group.id, user_id: ctx.profile.id, role: 'teacher' }))
    await audit(ctx, d.workspaceId, 'group.create', 'group', group.id, { name: d.name })
    refresh(d.workspaceId)
    return { ok: true, data: { id: group.id }, message: ctx.t.teach.overview.groupCreated }
  })
}

export async function archiveGroupAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = GroupRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const { workspaceId, groupId } = parsed.data
    await staffFor(ctx, workspaceId, 'group.archive', groupId)
    const now = new Date().toISOString()
    must(await ctx.admin.from('groups').update({ status: 'archived', archived_at: now }).eq('id', groupId).eq('workspace_id', workspaceId))
    must(await ctx.admin.from('workspace_invitations').update({ revoked_at: now }).eq('group_id', groupId).is('revoked_at', null))
    await audit(ctx, workspaceId, 'group.archive', 'group', groupId)
    refresh(workspaceId)
    return { ok: true, message: ctx.t.teach.group.archived }
  })
}

// ---------------------------------------------------------------------------
// Invitations and members
// ---------------------------------------------------------------------------

export async function createInvitationAction(input: unknown): Promise<ActionResult<{ code: string }>> {
  return run(async (ctx) => {
    const parsed = CreateInvitationSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    const m = d.groupId
      ? await staffFor(ctx, d.workspaceId, 'group.invite_students', d.groupId)
      : await staffFor(ctx, d.workspaceId, 'staff.invite')
    // Group invitations bring students (or a co-teacher chosen by a manager); workspace invitations bring staff.
    const allowed = invitableRoles(m.role)
    if (!allowed.includes(d.role) || (d.groupId && d.role !== 'student' && !isManagerRole(m.role)) || (!d.groupId && d.role === 'student')) {
      throw new Denied('forbidden')
    }
    const expiresAt = new Date(Date.now() + d.days * 86_400_000).toISOString()
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = generateCode()
      const res = await ctx.admin
        .from('workspace_invitations')
        .insert({ workspace_id: d.workspaceId, group_id: d.groupId, role: d.role, code, max_uses: d.maxUses, expires_at: expiresAt, created_by: ctx.profile.id })
        .select('id')
        .single()
      if (res.error && (res.error as { code?: string }).code === '23505') continue // code collision: try another
      const created = row(res)
      await audit(ctx, d.workspaceId, 'invitation.create', 'workspace_invitation', created.id, { role: d.role, group_id: d.groupId, days: d.days, max_uses: d.maxUses })
      refresh(d.workspaceId)
      return { ok: true, data: { code }, message: ctx.t.teach.invite.created }
    }
    throw new Error('could not generate a unique invitation code')
  })
}

export async function revokeInvitationAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = RevokeInvitationSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const { workspaceId, invitationId } = parsed.data
    const inv = must(await ctx.admin.from('workspace_invitations').select('id, group_id').eq('id', invitationId).eq('workspace_id', workspaceId).maybeSingle())
    if (!inv) throw new Denied('notFound')
    if (inv.group_id) await staffFor(ctx, workspaceId, 'group.invite_students', inv.group_id)
    else await staffFor(ctx, workspaceId, 'staff.invite')
    must(await ctx.admin.from('workspace_invitations').update({ revoked_at: new Date().toISOString() }).eq('id', invitationId))
    await audit(ctx, workspaceId, 'invitation.revoke', 'workspace_invitation', invitationId)
    refresh(workspaceId)
    return { ok: true, message: ctx.t.teach.invite.revoked }
  })
}

export async function removeStudentAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = RemoveStudentSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const { workspaceId, groupId, studentId } = parsed.data
    await staffFor(ctx, workspaceId, 'group.remove_student', groupId)
    const res = must(
      await ctx.admin
        .from('group_members')
        .update({ left_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('user_id', studentId)
        .eq('role', 'student')
        .is('left_at', null)
        .select('user_id'),
    )
    if (!res || res.length === 0) throw new Denied('notFound')
    await audit(ctx, workspaceId, 'group.remove_student', 'group', groupId, { student_id: studentId })
    refresh(workspaceId)
    return { ok: true, message: ctx.t.teach.group.removed }
  })
}

export async function removeMemberAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = RemoveMemberSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const { workspaceId, userId } = parsed.data
    const m = await staffFor(ctx, workspaceId, 'member.remove')
    if (userId === m.workspace.ownerId) throw new Denied('forbidden') // the owner cannot be removed
    const now = new Date().toISOString()
    const res = must(
      await ctx.admin.from('workspace_members').update({ status: 'removed', removed_at: now }).eq('workspace_id', workspaceId).eq('user_id', userId).eq('status', 'active').select('user_id'),
    )
    if (!res || res.length === 0) throw new Denied('notFound')
    must(await ctx.admin.from('group_members').update({ left_at: now }).eq('workspace_id', workspaceId).eq('user_id', userId).is('left_at', null))
    await audit(ctx, workspaceId, 'member.remove', 'workspace_member', userId)
    refresh(workspaceId)
    return { ok: true, message: ctx.t.teach.team.removed }
  })
}

// ---------------------------------------------------------------------------
// Assignments and grading
// ---------------------------------------------------------------------------

async function validatePractice(ctx: Ctx, p: PracticeConfig) {
  const taxonomy = await getTaxonomy(ctx.admin)
  const subject = taxonomy.subjectByCode.get(p.subjectCode)
  if (!subject) throw new Denied('checkFields')
  if (p.domainId && taxonomy.domainById.get(p.domainId)?.subjectId !== subject.id) throw new Denied('checkFields')
}

export async function createAssignmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return run(async (ctx) => {
    const parsed = CreateAssignmentSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    const m = await staffFor(ctx, d.workspaceId, 'assignment.create', d.groupId)
    if (d.kind === 'practice') await validatePractice(ctx, d.practice!)
    if (d.kind === 'mock_exam') {
      const exam = must(await ctx.admin.from('mock_exams').select('id').eq('id', d.mockExamId!).eq('status', 'published').maybeSingle())
      if (!exam) throw new Denied('checkFields')
    }
    if (d.dueAt && new Date(d.dueAt).getTime() < Date.now()) throw new Denied('checkFields')
    const now = new Date().toISOString()
    const created = row(
      await ctx.admin
        .from('assignments')
        .insert({
          workspace_id: d.workspaceId,
          group_id: d.groupId,
          title: d.title,
          instructions: d.instructions,
          kind: d.kind,
          practice_config: d.kind === 'practice' ? d.practice : null,
          mock_exam_id: d.kind === 'mock_exam' ? d.mockExamId : null,
          due_at: d.dueAt,
          points: d.kind === 'mock_exam' ? null : d.points,
          status: 'published',
          published_at: now,
          created_by: ctx.profile.id,
        })
        .select('id')
        .single(),
    )
    await audit(ctx, d.workspaceId, 'assignment.create', 'assignment', created.id, { kind: d.kind, group_id: d.groupId, title: d.title })
    await notifyStudents(ctx.admin, d.groupId, created.id, d.title, m.workspace.name)
    refresh(d.workspaceId)
    return { ok: true, data: { id: created.id }, message: ctx.t.teach.assignment.created }
  })
}

/** In-app notification for each student of the group, in the student's own language. */
async function notifyStudents(admin: Db, groupId: string, assignmentId: string, title: string, workspaceName: string) {
  try {
    const [members, { data: group }] = await Promise.all([
      admin.from('group_members').select('user_id').eq('group_id', groupId).eq('role', 'student').is('left_at', null),
      admin.from('groups').select('name').eq('id', groupId).single(),
    ])
    if (members.error) throw members.error
    const ids = (members.data ?? []).map((mm) => mm.user_id)
    if (ids.length === 0) return
    // group_members references workspace_members, not profiles, so the languages are a second read.
    const { data: profiles, error } = await admin.from('profiles').select('id, locale').in('id', ids)
    if (error) throw error
    const localeOf = new Map((profiles ?? []).map((p) => [p.id, p.locale]))
    const rows = ids.map((userId) => {
      const locale = localeOf.get(userId)
      const n = resolveDict(classroomDict, isLocale(locale) ? locale : 'en').notify
      return {
        user_id: userId,
        type: 'study' as const,
        title: format(n.newAssignment, { title }).slice(0, 160),
        body: format(n.newAssignmentBody, { group: group?.name ?? '', workspace: workspaceName }).slice(0, 2000),
        link: `/dashboard/classes/${assignmentId}`,
      }
    })
    if (rows.length) {
      const { error } = await admin.from('notifications').insert(rows)
      if (error) throw error
    }
  } catch (err) {
    console.error('[classroom] could not notify students', err)
  }
}

export async function closeAssignmentAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = AssignmentRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const a = await assignmentById(ctx.admin, parsed.data.assignmentId)
    if (!a || a.workspace_id !== parsed.data.workspaceId) throw new Denied('notFound')
    await staffFor(ctx, a.workspace_id, 'assignment.close', a.group_id)
    must(await ctx.admin.from('assignments').update({ status: 'closed' }).eq('id', a.id))
    await audit(ctx, a.workspace_id, 'assignment.close', 'assignment', a.id)
    refresh(a.workspace_id)
    return { ok: true, message: ctx.t.teach.assignment.closedToast }
  })
}

export async function gradeSubmissionAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = GradeSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    const a = await assignmentById(ctx.admin, d.assignmentId)
    if (!a || a.workspace_id !== d.workspaceId || a.kind !== 'text') throw new Denied('notFound')
    const m = await staffFor(ctx, a.workspace_id, 'submission.grade', a.group_id)
    if (d.score > (a.points ?? 100)) throw new Denied('checkFields')
    const now = new Date().toISOString()
    const res = must(
      await ctx.admin
        .from('submissions')
        .update({ status: 'graded', score: d.score, feedback: d.feedback || null, graded_by: ctx.profile.id, graded_at: now })
        .eq('assignment_id', a.id)
        .eq('student_id', d.studentId)
        .in('status', ['submitted', 'graded'])
        .select('student_id'),
    )
    if (!res || res.length === 0) throw new Denied('notFound')
    await audit(ctx, a.workspace_id, 'submission.grade', 'submission', `${a.id}:${d.studentId}`, { score: d.score })
    try {
      const { data: p } = await ctx.admin.from('profiles').select('locale').eq('id', d.studentId).single()
      const n = resolveDict(classroomDict, p && isLocale(p.locale) ? p.locale : 'en').notify
      await ctx.admin.from('notifications').insert({
        user_id: d.studentId,
        type: 'study',
        title: format(n.graded, { title: a.title }).slice(0, 160),
        body: format(n.gradedBody, { workspace: m.workspace.name }),
        link: `/dashboard/classes/${a.id}`,
      })
    } catch (err) {
      console.error('[classroom] could not notify the student', err)
    }
    refresh(a.workspace_id)
    return { ok: true, message: ctx.t.teach.assignment.saved }
  })
}

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

export async function joinWithCodeAction(input: unknown): Promise<ActionResult<{ workspaceId: string; workspaceName: string; already: boolean; staff: boolean }>> {
  return run(async (ctx) => {
    const parsed = JoinSchema.safeParse(input)
    const code = parsed.success ? normalizeCode(parsed.data.code) : null
    // Guessing codes is rate-limited per account and per IP.
    const [byUser, byIp] = await Promise.all([
      checkRateLimit(RATE_LIMITS.classroomJoin, `u:${ctx.profile.id}`),
      checkRateLimit(RATE_LIMITS.classroomJoin, `ip:${await clientIp()}`),
    ])
    if (!byUser.allowed || !byIp.allowed) throw new Denied('rateLimited')
    if (!code) throw new Denied('invalidCode')
    const { data, error } = await ctx.admin.rpc('workspace_join', { p_user: ctx.profile.id, p_code: code })
    if (error) {
      const m = error.message
      if (/not found/.test(m)) throw new Denied('inviteNotFound')
      if (/expired/.test(m)) throw new Denied('inviteExpired')
      if (/used up/.test(m)) throw new Denied('inviteUsedUp')
      if (/unavailable/.test(m)) throw new Denied('workspaceUnavailable')
      throw error
    }
    const joined = (data as Array<{ workspace_id: string; group_id: string | null; role: string; joined: boolean }>)[0]!
    const ws = row(await ctx.admin.from('workspaces').select('name').eq('id', joined.workspace_id).single())
    await audit(ctx, joined.workspace_id, 'workspace.join', 'workspace_member', ctx.profile.id, { role: joined.role, group_id: joined.group_id, new: joined.joined })
    refresh(joined.workspace_id)
    return {
      ok: true,
      data: { workspaceId: joined.workspace_id, workspaceName: ws.name, already: !joined.joined, staff: joined.role !== 'student' },
      message: format(joined.joined ? ctx.t.classes.joined : ctx.t.classes.already, { workspace: ws.name }),
    }
  })
}

export async function setProgressSharingAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = SharingSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const { workspaceId, enabled } = parsed.data
    const m = await getMembership(ctx.admin, ctx.profile.id, workspaceId)
    if (!m || m.role !== 'student') throw new Denied('notFound')
    const now = new Date().toISOString()
    must(
      await ctx.admin
        .from('progress_sharing')
        .upsert({ workspace_id: workspaceId, student_id: ctx.profile.id, granted_at: now, revoked_at: enabled ? null : now }, { onConflict: 'workspace_id,student_id' }),
    )
    await audit(ctx, workspaceId, enabled ? 'progress_sharing.grant' : 'progress_sharing.revoke', 'progress_sharing', ctx.profile.id)
    refresh(workspaceId)
    return { ok: true, message: enabled ? ctx.t.classes.sharingOn : ctx.t.classes.sharingOff }
  })
}

async function studentAssignment(ctx: Ctx, assignmentId: string) {
  const a = await assignmentById(ctx.admin, assignmentId)
  if (!a || a.status === 'draft') throw new Denied('notFound')
  const [member, ws] = await Promise.all([
    ctx.admin.from('group_members').select('user_id').eq('group_id', a.group_id).eq('user_id', ctx.profile.id).eq('role', 'student').is('left_at', null).maybeSingle(),
    getMembership(ctx.admin, ctx.profile.id, a.workspace_id),
  ])
  if (!must(member) || !ws || ws.role !== 'student') throw new Denied('notFound')
  return a
}

export async function startAssignmentAction(input: unknown): Promise<ActionResult<{ attemptId: string }>> {
  return run(async (ctx) => {
    const parsed = StartAssignmentSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const a = await studentAssignment(ctx, parsed.data.assignmentId)
    if (a.kind !== 'practice') throw new Denied('notFound')
    const existing = must(
      await ctx.admin.from('submissions').select('status, attempt_id, attempts(status)').eq('assignment_id', a.id).eq('student_id', ctx.profile.id).maybeSingle(),
    )
    const attemptStatus = (existing?.attempts as { status: string } | null)?.status
    if (existing?.attempt_id && attemptStatus === 'in_progress') return { ok: true, data: { attemptId: existing.attempt_id } }
    if (existing && existing.status !== 'started') return { ok: true, data: { attemptId: existing.attempt_id ?? '' } }
    if (a.status === 'closed') throw new Denied('closed')
    const cfg = a.practice_config as PracticeConfig
    const { attemptId } = await startPractice(
      ctx.admin,
      ctx.profile,
      { mode: 'custom', subjectCode: cfg.subjectCode, ...(cfg.domainId ? { domainId: cfg.domainId } : {}), difficulty: cfg.difficulty, count: cfg.count, timed: cfg.timed },
      { assignmentId: a.id },
    )
    must(
      await ctx.admin
        .from('submissions')
        .upsert({ workspace_id: a.workspace_id, assignment_id: a.id, student_id: ctx.profile.id, status: 'started', attempt_id: attemptId }, { onConflict: 'assignment_id,student_id' }),
    )
    return { ok: true, data: { attemptId } }
  })
}

export async function submitTextAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = SubmitTextSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const a = await studentAssignment(ctx, parsed.data.assignmentId)
    if (a.kind !== 'text') throw new Denied('notFound')
    if (a.status === 'closed') throw new Denied('closed')
    const existing = must(await ctx.admin.from('submissions').select('status').eq('assignment_id', a.id).eq('student_id', ctx.profile.id).maybeSingle())
    if (existing?.status === 'graded') throw new Denied('alreadyGraded')
    must(
      await ctx.admin.from('submissions').upsert(
        {
          workspace_id: a.workspace_id,
          assignment_id: a.id,
          student_id: ctx.profile.id,
          status: 'submitted',
          text_answer: parsed.data.text,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: 'assignment_id,student_id' },
      ),
    )
    await audit(ctx, a.workspace_id, 'submission.submit', 'submission', `${a.id}:${ctx.profile.id}`)
    refresh(a.workspace_id)
    return { ok: true, message: ctx.t.classes.submitted }
  })
}
