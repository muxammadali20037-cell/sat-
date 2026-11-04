/**
 * Classroom lessons (PHASE 4-A): input schemas and pure helpers (unit-tested, client-safe).
 * Lessons point to the teacher's own meeting link; SAT MASTER does not host video in this phase.
 */
import { z } from 'zod'

const id = z.guid()
const httpsUrl = z
  .string()
  .trim()
  .max(600)
  .refine((v) => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' && !u.username && !u.password
    } catch {
      return false
    }
  }, 'https')

export const CreateSessionSchema = z.object({
  workspaceId: id,
  groupId: id,
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(''),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(360),
  location: z.string().trim().max(200).default(''),
  meetingUrl: httpsUrl.nullable().default(null),
  /** Weekly repeats (same weekday and time), including the first lesson. */
  repeatWeeks: z.number().int().min(1).max(16).default(1),
})
export type CreateSessionInput = z.input<typeof CreateSessionSchema>

export const SessionRefSchema = z.object({ workspaceId: id, sessionId: id })

export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'excused'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const MarkAttendanceSchema = z.object({
  workspaceId: id,
  sessionId: id,
  marks: z
    .array(z.object({ studentId: id, status: z.enum(ATTENDANCE_STATUSES), note: z.string().trim().max(300).default('') }))
    .min(1)
    .max(300),
})

export const AddLinkMaterialSchema = z.object({
  workspaceId: id,
  groupId: id,
  sessionId: id.nullable().default(null),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(''),
  url: httpsUrl,
})

export const MATERIAL_TYPES: Record<string, 'pdf' | 'png' | 'jpg' | 'webp'> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024

export const MaterialUploadSchema = z.object({
  workspaceId: id,
  groupId: id,
  contentType: z.string().max(100),
  size: z.number().int().positive(),
})
export const FinalizeMaterialSchema = z.object({
  workspaceId: id,
  groupId: id,
  sessionId: id.nullable().default(null),
  path: z.string().max(200),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).default(''),
  fileName: z.string().trim().min(1).max(200),
})
export const MaterialRefSchema = z.object({ materialId: id })

/** ws/<workspace>/<group>/<uuid>.<ext> — the only shape the server accepts (mirrors the DB check). */
export const MATERIAL_PATH_RE = /^ws\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/

export function materialPath(workspaceId: string, groupId: string, fileId: string, ext: string): string {
  return `ws/${workspaceId}/${groupId}/${fileId}.${ext}`
}

/** A path is only valid for the workspace and group it was minted for. */
export function pathBelongsTo(path: string, workspaceId: string, groupId: string): boolean {
  return MATERIAL_PATH_RE.test(path) && path.startsWith(`ws/${workspaceId}/${groupId}/`)
}

export function checkMaterialFile(file: { type: string; size: number }): 'type' | 'size' | null {
  if (!MATERIAL_TYPES[file.type]) return 'type'
  if (file.size <= 0 || file.size > MAX_MATERIAL_BYTES) return 'size'
  return null
}

/** Start times for a weekly series: the first lesson plus (n - 1) weekly repeats. */
export function weeklyStarts(firstIso: string, weeks: number): string[] {
  const first = new Date(firstIso).getTime()
  return Array.from({ length: weeks }, (_, i) => new Date(first + i * 7 * 86_400_000).toISOString())
}

export type SessionTiming = 'upcoming' | 'live' | 'ended'

/** Where a lesson is in time ("live" from 10 minutes before the start until its end). */
export function sessionTiming(startsAt: string, durationMinutes: number, now: Date): SessionTiming {
  const start = Date.parse(startsAt)
  const end = start + durationMinutes * 60_000
  const t = now.getTime()
  if (t >= end) return 'ended'
  if (t >= start - 10 * 60_000) return 'live'
  return 'upcoming'
}

export type AttendanceSummary = { marked: number; present: number; late: number; absent: number; excused: number; rate: number | null }

/** Attendance rate counts present and late as attended; excused lessons are left out of the rate. */
export function summarizeAttendance(statuses: AttendanceStatus[]): AttendanceSummary {
  const n = (s: AttendanceStatus) => statuses.filter((x) => x === s).length
  const present = n('present')
  const late = n('late')
  const absent = n('absent')
  const excused = n('excused')
  const counted = present + late + absent
  return { marked: statuses.length, present, late, absent, excused, rate: counted > 0 ? (present + late) / counted : null }
}

export type GroupAnalytics = {
  students: number
  attendance: AttendanceSummary
  /** Practice and written work only (mock exams are counted from attempts elsewhere). */
  completion: { done: number; expected: number; rate: number | null }
  /** Average of score / points over scored practice and written work (0–1). */
  averageScore: { value: number | null; count: number }
}

export function groupAnalytics(input: {
  studentIds: string[]
  attendance: Array<{ student_id: string; status: AttendanceStatus }>
  assignments: Array<{ id: string; kind: string; points: number | null; assignee_id: string | null; status: string }>
  submissions: Array<{ assignment_id: string; student_id: string; status: string; score: number | null }>
}): GroupAnalytics {
  const current = new Set(input.studentIds)
  const attendance = summarizeAttendance(input.attendance.filter((a) => current.has(a.student_id)).map((a) => a.status))
  const work = input.assignments.filter((a) => (a.kind === 'practice' || a.kind === 'text') && a.status !== 'draft')
  const byId = new Map(work.map((a) => [a.id, a]))
  let expected = 0
  for (const a of work) expected += a.assignee_id ? (current.has(a.assignee_id) ? 1 : 0) : current.size
  const relevant = input.submissions.filter((s) => byId.has(s.assignment_id) && current.has(s.student_id))
  const done = relevant.filter((s) => s.status === 'submitted' || s.status === 'graded').length
  const scored = relevant.filter((s) => s.score !== null && s.status !== 'started')
  const ratios = scored.map((s) => Number(s.score) / (byId.get(s.assignment_id)!.points ?? 100))
  return {
    students: current.size,
    attendance,
    completion: { done, expected, rate: expected > 0 ? Math.min(1, done / expected) : null },
    averageScore: { value: ratios.length ? ratios.reduce((x, y) => x + y, 0) / ratios.length : null, count: ratios.length },
  }
}

/** In-app live lessons can be joined from 15 minutes before the start until 30 minutes after the end. */
export const LIVE_OPENS_MINUTES_BEFORE = 15
export const LIVE_CLOSES_MINUTES_AFTER = 30

export type LiveWindow = 'too_early' | 'open' | 'closed'

export function liveWindow(startsAt: string, durationMinutes: number, now: Date): LiveWindow {
  const start = Date.parse(startsAt)
  const t = now.getTime()
  if (t < start - LIVE_OPENS_MINUTES_BEFORE * 60_000) return 'too_early'
  if (t > start + (durationMinutes + LIVE_CLOSES_MINUTES_AFTER) * 60_000) return 'closed'
  return 'open'
}

/** LiveKit room name for a lesson (one room per lesson). */
export const liveRoomName = (sessionId: string) => `lesson-${sessionId}`
