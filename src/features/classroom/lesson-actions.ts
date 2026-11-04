'use server'

import type { ActionResult } from '@/lib/api/errors'
import { format, resolveDict } from '@/lib/i18n/dict'
import { isLocale } from '@/lib/i18n/config'
import { classroomDict } from '@/lib/i18n/dictionaries/classroom'
import type { Db } from '@/lib/supabase/server'
import { audit, Denied, must, refresh, row, run, staffFor, type Ctx } from './action-kit'
import { getMembership } from './server'
import {
  AddLinkMaterialSchema,
  checkMaterialFile,
  CreateSessionSchema,
  FinalizeMaterialSchema,
  MarkAttendanceSchema,
  MaterialRefSchema,
  MaterialUploadSchema,
  MATERIAL_TYPES,
  materialPath,
  pathBelongsTo,
  SessionRefSchema,
  weeklyStarts,
} from './lessons'

/**
 * Lesson schedule, attendance and class materials. Same pattern as actions.ts: validate, resolve
 * the actor's workspace role, check can(), write with the service role, audit.
 */

const BUCKET = 'workspace-files'
const DOWNLOAD_TTL_SECONDS = 10 * 60

export async function createSessionAction(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  return run(async (ctx) => {
    const parsed = CreateSessionSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    const m = await staffFor(ctx, d.workspaceId, 'session.manage', d.groupId)
    if (Date.parse(d.startsAt) < Date.now() - 60 * 60_000) throw new Denied('checkFields')
    const rows = weeklyStarts(d.startsAt, d.repeatWeeks).map((starts_at) => ({
      workspace_id: d.workspaceId,
      group_id: d.groupId,
      title: d.title,
      description: d.description,
      starts_at,
      duration_minutes: d.durationMinutes,
      location: d.location,
      meeting_url: d.meetingUrl,
      created_by: ctx.profile.id,
    }))
    const created = must(await ctx.admin.from('class_sessions').insert(rows).select('id, starts_at').order('starts_at')) ?? []
    await audit(ctx, d.workspaceId, 'session.create', 'class_session', created[0]?.id ?? '', { group_id: d.groupId, count: created.length, title: d.title })
    await notifyGroup(ctx.admin, d.groupId, d.title, created[0]?.starts_at ?? d.startsAt, m.workspace.name, m.workspace.timezone)
    refresh(d.workspaceId)
    return { ok: true, data: { ids: created.map((c) => c.id) }, message: ctx.t.teach.lessons.created }
  })
}

/** In-app notice to each student of the group, in their own language and the workspace's time zone. */
async function notifyGroup(admin: Db, groupId: string, title: string, startsAt: string, workspaceName: string, timeZone: string) {
  try {
    const members = must(await admin.from('group_members').select('user_id').eq('group_id', groupId).eq('role', 'student').is('left_at', null)) ?? []
    const ids = members.map((x) => x.user_id)
    if (!ids.length) return
    const profiles = must(await admin.from('profiles').select('id, locale').in('id', ids)) ?? []
    const localeOf = new Map(profiles.map((p) => [p.id, p.locale]))
    const rows = ids.map((userId) => {
      const loc = localeOf.get(userId)
      const locale = isLocale(loc) ? loc : 'en'
      const n = resolveDict(classroomDict, locale).notify
      const when = new Intl.DateTimeFormat(locale === 'uz' ? 'uz-Latn-UZ' : locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(startsAt))
      return {
        user_id: userId,
        type: 'study' as const,
        title: format(n.newLesson, { title }).slice(0, 160),
        body: format(n.newLessonBody, { when, workspace: workspaceName }).slice(0, 2000),
        link: '/dashboard/classes',
      }
    })
    const { error } = await admin.from('notifications').insert(rows)
    if (error) throw error
  } catch (err) {
    console.error('[classroom] could not notify about a lesson', err)
  }
}

async function sessionFor(ctx: Ctx, workspaceId: string, sessionId: string) {
  const s = must(await ctx.admin.from('class_sessions').select('id, workspace_id, group_id, status, starts_at').eq('id', sessionId).eq('workspace_id', workspaceId).maybeSingle())
  if (!s) throw new Denied('notFound')
  return s
}

export async function cancelSessionAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = SessionRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const s = await sessionFor(ctx, parsed.data.workspaceId, parsed.data.sessionId)
    await staffFor(ctx, s.workspace_id, 'session.manage', s.group_id)
    must(await ctx.admin.from('class_sessions').update({ status: 'cancelled' }).eq('id', s.id))
    await audit(ctx, s.workspace_id, 'session.cancel', 'class_session', s.id)
    refresh(s.workspace_id)
    return { ok: true, message: ctx.t.teach.lessons.cancelled }
  })
}

export async function markAttendanceAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = MarkAttendanceSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    const s = await sessionFor(ctx, d.workspaceId, d.sessionId)
    await staffFor(ctx, s.workspace_id, 'attendance.mark', s.group_id)
    if (s.status === 'cancelled') throw new Denied('closed')
    // Only students currently in this group can be marked.
    const members = must(await ctx.admin.from('group_members').select('user_id').eq('group_id', s.group_id).eq('role', 'student').is('left_at', null)) ?? []
    const allowed = new Set(members.map((x) => x.user_id))
    if (d.marks.some((mk) => !allowed.has(mk.studentId))) throw new Denied('notFound')
    const now = new Date().toISOString()
    must(
      await ctx.admin.from('attendance').upsert(
        d.marks.map((mk) => ({ workspace_id: s.workspace_id, session_id: s.id, student_id: mk.studentId, status: mk.status, note: mk.note, marked_by: ctx.profile.id, marked_at: now })),
        { onConflict: 'session_id,student_id' },
      ),
    )
    if (s.status === 'scheduled' && Date.parse(s.starts_at) <= Date.now()) must(await ctx.admin.from('class_sessions').update({ status: 'completed' }).eq('id', s.id))
    await audit(ctx, s.workspace_id, 'attendance.mark', 'class_session', s.id, { count: d.marks.length })
    refresh(s.workspace_id)
    return { ok: true, message: ctx.t.teach.lessons.attendanceSaved }
  })
}

export async function addLinkMaterialAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = AddLinkMaterialSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    await staffFor(ctx, d.workspaceId, 'material.manage', d.groupId)
    if (d.sessionId) await sessionInGroup(ctx, d.workspaceId, d.groupId, d.sessionId)
    const created = row(
      await ctx.admin
        .from('class_materials')
        .insert({ workspace_id: d.workspaceId, group_id: d.groupId, session_id: d.sessionId, title: d.title, description: d.description, kind: 'link', url: d.url, created_by: ctx.profile.id })
        .select('id')
        .single(),
    )
    await audit(ctx, d.workspaceId, 'material.add', 'class_material', created.id, { kind: 'link', group_id: d.groupId })
    refresh(d.workspaceId)
    return { ok: true, message: ctx.t.teach.materials.added }
  })
}

async function sessionInGroup(ctx: Ctx, workspaceId: string, groupId: string, sessionId: string) {
  const s = await sessionFor(ctx, workspaceId, sessionId)
  if (s.group_id !== groupId) throw new Denied('notFound')
}

/** Step 1 of a file upload: a server-chosen path and a one-time signed upload token. */
export async function createMaterialUploadAction(input: unknown): Promise<ActionResult<{ path: string; token: string }>> {
  return run(async (ctx) => {
    const parsed = MaterialUploadSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    await staffFor(ctx, d.workspaceId, 'material.manage', d.groupId)
    const problem = checkMaterialFile({ type: d.contentType, size: d.size })
    if (problem) return { ok: false, error: problem === 'type' ? ctx.t.teach.materials.badType : ctx.t.teach.materials.tooBig }
    const path = materialPath(d.workspaceId, d.groupId, crypto.randomUUID(), MATERIAL_TYPES[d.contentType]!)
    const { data, error } = await ctx.admin.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) {
      console.error('[classroom] signed upload url failed', error)
      return { ok: false, error: ctx.t.teach.materials.storageDown }
    }
    return { ok: true, data: { path: data.path, token: data.token } }
  })
}

/** Step 2: re-check the stored object's real type and size, then record it (or delete it). */
export async function finalizeMaterialAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = FinalizeMaterialSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const d = parsed.data
    await staffFor(ctx, d.workspaceId, 'material.manage', d.groupId)
    if (!pathBelongsTo(d.path, d.workspaceId, d.groupId)) throw new Denied('notFound')
    if (d.sessionId) await sessionInGroup(ctx, d.workspaceId, d.groupId, d.sessionId)
    const bucket = ctx.admin.storage.from(BUCKET)
    const { data: info, error } = await bucket.info(d.path)
    if (error || !info) return { ok: false, error: ctx.t.teach.materials.uploadFailed }
    const type = String(info.contentType ?? '')
    const size = Number(info.size ?? 0)
    const problem = checkMaterialFile({ type, size })
    if (problem || MATERIAL_TYPES[type] !== d.path.split('.').pop()) {
      await bucket.remove([d.path])
      return { ok: false, error: problem === 'size' ? ctx.t.teach.materials.tooBig : ctx.t.teach.materials.badType }
    }
    const created = row(
      await ctx.admin
        .from('class_materials')
        .insert({
          workspace_id: d.workspaceId,
          group_id: d.groupId,
          session_id: d.sessionId,
          title: d.title,
          description: d.description,
          kind: 'file',
          storage_path: d.path,
          file_name: d.fileName,
          mime_type: type,
          size_bytes: size,
          created_by: ctx.profile.id,
        })
        .select('id')
        .single(),
    )
    await audit(ctx, d.workspaceId, 'material.add', 'class_material', created.id, { kind: 'file', group_id: d.groupId, size })
    refresh(d.workspaceId)
    return { ok: true, message: ctx.t.teach.materials.added }
  })
}

export async function archiveMaterialAction(input: unknown): Promise<ActionResult> {
  return run(async (ctx) => {
    const parsed = MaterialRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const mat = must(await ctx.admin.from('class_materials').select('id, workspace_id, group_id').eq('id', parsed.data.materialId).maybeSingle())
    if (!mat) throw new Denied('notFound')
    await staffFor(ctx, mat.workspace_id, 'material.manage', mat.group_id)
    // Archived, not deleted: the file stays for the record; students stop seeing it.
    must(await ctx.admin.from('class_materials').update({ archived_at: new Date().toISOString() }).eq('id', mat.id))
    await audit(ctx, mat.workspace_id, 'material.archive', 'class_material', mat.id)
    refresh(mat.workspace_id)
    return { ok: true, message: ctx.t.teach.materials.archived }
  })
}

/** A short-lived download link for the group's staff or one of its current students. */
export async function materialDownloadAction(input: unknown): Promise<ActionResult<{ url: string }>> {
  return run(async (ctx) => {
    const parsed = MaterialRefSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: ctx.t.errors.checkFields }
    const mat = must(
      await ctx.admin.from('class_materials').select('id, workspace_id, group_id, kind, storage_path, file_name, archived_at').eq('id', parsed.data.materialId).maybeSingle(),
    )
    if (!mat || mat.kind !== 'file' || !mat.storage_path) throw new Denied('notFound')
    const m = await getMembership(ctx.admin, ctx.profile.id, mat.workspace_id)
    if (!m) throw new Denied('notFound')
    if (m.role === 'student') {
      const inGroup = must(
        await ctx.admin.from('group_members').select('user_id').eq('group_id', mat.group_id).eq('user_id', ctx.profile.id).eq('role', 'student').is('left_at', null).maybeSingle(),
      )
      if (!inGroup || mat.archived_at) throw new Denied('notFound')
    } else {
      await staffFor(ctx, mat.workspace_id, 'group.view', mat.group_id)
    }
    const { data, error } = await ctx.admin.storage.from(BUCKET).createSignedUrl(mat.storage_path, DOWNLOAD_TTL_SECONDS, { download: mat.file_name ?? true })
    if (error || !data) return { ok: false, error: ctx.t.teach.materials.storageDown }
    return { ok: true, data: { url: data.signedUrl } }
  })
}
