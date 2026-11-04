import 'server-only'
import { notFound } from 'next/navigation'
import type { Db } from '@/lib/supabase/server'
import { profileNames, teachableGroupIds, type Membership } from './server'
import { groupAnalytics, summarizeAttendance, type AttendanceStatus, type GroupAnalytics } from './lessons'

/** Loaders for lessons, attendance and materials. Service role; every call is scoped by membership first. */

const isId = (v: string) => /^[0-9a-f-]{36}$/i.test(v)

export type SessionView = {
  id: string
  title: string
  description: string
  startsAt: string
  durationMinutes: number
  location: string
  meetingUrl: string | null
  status: 'scheduled' | 'cancelled' | 'completed'
  marked: number
}
export type MaterialView = {
  id: string
  title: string
  description: string
  kind: 'file' | 'link'
  url: string | null
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
}

const SESSION_COLS = 'id, title, description, starts_at, duration_minutes, location, meeting_url, status'
const MATERIAL_COLS = 'id, title, description, kind, url, file_name, mime_type, size_bytes, created_at'

type SessionRow = { id: string; title: string; description: string; starts_at: string; duration_minutes: number; location: string; meeting_url: string | null; status: string }
type MaterialRow = { id: string; title: string; description: string; kind: string; url: string | null; file_name: string | null; mime_type: string | null; size_bytes: number | null; created_at: string }

const toSession = (s: SessionRow, marked = 0): SessionView => ({
  id: s.id,
  title: s.title,
  description: s.description,
  startsAt: s.starts_at,
  durationMinutes: s.duration_minutes,
  location: s.location,
  meetingUrl: s.meeting_url,
  status: s.status as SessionView['status'],
  marked,
})
const toMaterial = (x: MaterialRow): MaterialView => ({
  id: x.id,
  title: x.title,
  description: x.description,
  kind: x.kind as MaterialView['kind'],
  url: x.url,
  fileName: x.file_name,
  mimeType: x.mime_type,
  sizeBytes: x.size_bytes,
  createdAt: x.created_at,
})

/** Teacher view of a group's lessons, materials and analytics (caller already checked group access). */
export async function loadGroupLessons(admin: Db, groupId: string): Promise<{ sessions: SessionView[]; materials: MaterialView[]; analytics: GroupAnalytics }> {
  const [sessions, materials, members, assignments] = await Promise.all([
    admin.from('class_sessions').select(SESSION_COLS).eq('group_id', groupId).order('starts_at'),
    admin.from('class_materials').select(MATERIAL_COLS).eq('group_id', groupId).is('archived_at', null).order('created_at', { ascending: false }),
    admin.from('group_members').select('user_id').eq('group_id', groupId).eq('role', 'student').is('left_at', null),
    admin.from('assignments').select('id, kind, points, assignee_id, status').eq('group_id', groupId),
  ])
  for (const r of [sessions, materials, members, assignments]) if (r.error) throw r.error
  const sessionIds = (sessions.data ?? []).map((s) => s.id)
  const asgIds = (assignments.data ?? []).map((a) => a.id)
  const [att, subs] = await Promise.all([
    sessionIds.length ? admin.from('attendance').select('session_id, student_id, status').in('session_id', sessionIds) : Promise.resolve({ data: [], error: null }),
    asgIds.length ? admin.from('submissions').select('assignment_id, student_id, status, score').in('assignment_id', asgIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (att.error) throw att.error
  if (subs.error) throw subs.error
  const attRows = (att.data ?? []) as Array<{ session_id: string; student_id: string; status: AttendanceStatus }>
  return {
    sessions: (sessions.data ?? []).map((s) => toSession(s as SessionRow, attRows.filter((a) => a.session_id === s.id).length)),
    materials: (materials.data ?? []).map((x) => toMaterial(x as MaterialRow)),
    analytics: groupAnalytics({
      studentIds: (members.data ?? []).map((x) => x.user_id),
      attendance: attRows,
      assignments: assignments.data ?? [],
      submissions: ((subs.data ?? []) as Array<{ assignment_id: string; student_id: string; status: string; score: number | null }>).map((s) => ({ ...s, score: s.score === null ? null : Number(s.score) })),
    }),
  }
}

/** Attendance page: one lesson, its group's current students and their marks. */
export async function loadSessionForTeacher(admin: Db, m: Membership, userId: string, sessionId: string) {
  if (!isId(sessionId)) notFound()
  const { data: s, error } = await admin.from('class_sessions').select(`${SESSION_COLS}, group_id, workspace_id`).eq('id', sessionId).maybeSingle()
  if (error) throw error
  if (!s || s.workspace_id !== m.workspace.id) notFound()
  if (!(await teachableGroupIds(admin, m, userId)).has(s.group_id)) notFound()
  const [members, att, group, joins] = await Promise.all([
    admin.from('group_members').select('user_id').eq('group_id', s.group_id).eq('role', 'student').is('left_at', null),
    admin.from('attendance').select('student_id, status, note').eq('session_id', s.id),
    admin.from('groups').select('id, name').eq('id', s.group_id).single(),
    admin.from('session_joins').select('user_id, first_joined_at').eq('session_id', s.id),
  ])
  for (const r of [members, att, group, joins]) if (r.error) throw r.error
  const joinedAt = new Map((joins.data ?? []).map((j) => [j.user_id, j.first_joined_at]))
  const ids = (members.data ?? []).map((x) => x.user_id)
  const names = await profileNames(admin, ids)
  const marks = new Map((att.data ?? []).map((a) => [a.student_id, a]))
  return {
    session: toSession(s as SessionRow, (att.data ?? []).length),
    group: group.data!,
    students: ids
      .map((id) => ({
        id,
        name: names.get(id)?.name ?? '—',
        status: (marks.get(id)?.status as AttendanceStatus | undefined) ?? null,
        note: marks.get(id)?.note ?? '',
        joinedAt: joinedAt.get(id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export type StudentLessons = {
  sessions: Array<SessionView & { groupName: string }>
  materials: Array<MaterialView & { groupName: string }>
  attendance: { rate: number | null; counted: number }
}

/**
 * A student's lessons (not ended yet, or ended in the last 12 hours), active materials and own
 * attendance, for the groups they are currently in.
 */
export async function loadMyLessons(admin: Db, userId: string, groups: Array<{ id: string; name: string }>, now = new Date()): Promise<StudentLessons> {
  if (groups.length === 0) return { sessions: [], materials: [], attendance: { rate: null, counted: 0 } }
  const ids = groups.map((g) => g.id)
  const name = new Map(groups.map((g) => [g.id, g.name]))
  const from = new Date(now.getTime() - 18 * 3_600_000).toISOString()
  const [sessions, materials, att] = await Promise.all([
    admin.from('class_sessions').select(`${SESSION_COLS}, group_id`).in('group_id', ids).gte('starts_at', from).order('starts_at').limit(30),
    admin.from('class_materials').select(`${MATERIAL_COLS}, group_id`).in('group_id', ids).is('archived_at', null).order('created_at', { ascending: false }).limit(60),
    admin.from('attendance').select('status, class_sessions!inner(group_id)').eq('student_id', userId).in('class_sessions.group_id', ids),
  ])
  for (const r of [sessions, materials, att]) if (r.error) throw r.error
  const summary = summarizeAttendance(((att.data ?? []) as Array<{ status: AttendanceStatus }>).map((a) => a.status))
  return {
    sessions: (sessions.data ?? [])
      .filter((s) => Date.parse(s.starts_at) + s.duration_minutes * 60_000 > now.getTime() - 12 * 3_600_000)
      .map((s) => ({ ...toSession(s as SessionRow), groupName: name.get(s.group_id) ?? '' })),
    materials: (materials.data ?? []).map((x) => ({ ...toMaterial(x as MaterialRow), groupName: name.get(x.group_id) ?? '' })),
    attendance: { rate: summary.rate, counted: summary.present + summary.late + summary.absent },
  }
}
