import 'server-only'
import { notFound } from 'next/navigation'
import type { Db } from '@/lib/supabase/server'
import { getTaxonomy } from '@/features/taxonomy/server'
import { rollupByDomain, type SkillPerfRow } from '@/features/analytics/aggregate'
import { isManagerRole, isStaffRole, type WorkspaceRole } from './permissions'
import { isTelegramOnlyEmail } from '@/features/telegram/shared'

/**
 * Classroom reads. Every function takes the AUTHORIZED user's id and checks membership itself
 * before reading with the service role; a workspace, group or assignment the user cannot access
 * is reported as "not found" (never "forbidden"), so ids cannot be probed.
 */

export type Workspace = { id: string; name: string; kind: 'individual' | 'center'; timezone: string; ownerId: string; status: string }
export type Membership = { workspace: Workspace; role: WorkspaceRole }

type WsRow = { id: string; name: string; kind: string; timezone: string; owner_id: string; status: string }
const toWorkspace = (w: WsRow): Workspace => ({ id: w.id, name: w.name, kind: w.kind as Workspace['kind'], timezone: w.timezone, ownerId: w.owner_id, status: w.status })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export async function listMemberships(admin: Db, userId: string): Promise<Membership[]> {
  const { data, error } = await admin
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, kind, timezone, owner_id, status)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('workspaces.status', 'active')
  if (error) throw error
  return (data ?? [])
    .map((r) => ({ workspace: toWorkspace(r.workspaces as unknown as WsRow), role: r.role as WorkspaceRole }))
    .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name))
}

export async function getMembership(admin: Db, userId: string, workspaceId: string): Promise<Membership | null> {
  if (!isId(workspaceId)) return null
  const { data, error } = await admin
    .from('workspace_members')
    .select('role, workspaces!inner(id, name, kind, timezone, owner_id, status)')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .eq('workspaces.status', 'active')
    .maybeSingle()
  if (error) throw error
  return data ? { workspace: toWorkspace(data.workspaces as unknown as WsRow), role: data.role as WorkspaceRole } : null
}

/** Staff membership or 404 (pages). */
export async function requireStaffMembership(admin: Db, userId: string, workspaceId: string): Promise<Membership> {
  const m = await getMembership(admin, userId, workspaceId)
  if (!m || !isStaffRole(m.role)) notFound()
  return m
}

/** Groups this staff member may teach: managers all active groups; teachers/assistants their own. */
export async function teachableGroupIds(admin: Db, m: Membership, userId: string): Promise<Set<string>> {
  if (isManagerRole(m.role)) {
    const { data, error } = await admin.from('groups').select('id').eq('workspace_id', m.workspace.id).eq('status', 'active')
    if (error) throw error
    return new Set((data ?? []).map((g) => g.id))
  }
  if (!isStaffRole(m.role)) return new Set()
  const { data, error } = await admin
    .from('group_members')
    .select('group_id, groups!inner(status)')
    .eq('workspace_id', m.workspace.id)
    .eq('user_id', userId)
    .in('role', ['teacher', 'assistant'])
    .is('left_at', null)
    .eq('groups.status', 'active')
  if (error) throw error
  return new Set((data ?? []).map((g) => g.group_id))
}

export async function profileNames(admin: Db, ids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 150) {
    const { data, error } = await admin.from('profiles').select('id, full_name, email').in('id', unique.slice(i, i + 150))
    if (error) throw error
    // Telegram-only accounts have a placeholder address; never show it as a contact.
    for (const p of data ?? []) {
      const email = isTelegramOnlyEmail(p.email) ? '' : p.email
      out.set(p.id, { name: p.full_name || email || '—', email })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Teacher: workspace overview
// ---------------------------------------------------------------------------

export type GroupSummary = { id: string; name: string; subject: string; students: number; assignments: number; toGrade: number }

export async function loadOverview(admin: Db, m: Membership, userId: string): Promise<{ groups: GroupSummary[] }> {
  const ids = [...(await teachableGroupIds(admin, m, userId))]
  if (ids.length === 0) return { groups: [] }
  const [groups, members, assignments] = await Promise.all([
    admin.from('groups').select('id, name, subject').in('id', ids).order('name'),
    admin.from('group_members').select('group_id').in('group_id', ids).eq('role', 'student').is('left_at', null),
    admin.from('assignments').select('id, group_id, kind').in('group_id', ids).neq('status', 'draft'),
  ])
  for (const r of [groups, members, assignments]) if (r.error) throw r.error
  const textIds = (assignments.data ?? []).filter((a) => a.kind === 'text').map((a) => a.id)
  const toGrade = textIds.length
    ? await admin.from('submissions').select('assignment_id').in('assignment_id', textIds).eq('status', 'submitted')
    : { data: [] as Array<{ assignment_id: string }>, error: null }
  if (toGrade.error) throw toGrade.error
  const groupOf = new Map((assignments.data ?? []).map((a) => [a.id, a.group_id]))
  return {
    groups: (groups.data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      subject: g.subject,
      students: (members.data ?? []).filter((x) => x.group_id === g.id).length,
      assignments: (assignments.data ?? []).filter((a) => a.group_id === g.id).length,
      toGrade: (toGrade.data ?? []).filter((s) => groupOf.get(s.assignment_id) === g.id).length,
    })),
  }
}

// ---------------------------------------------------------------------------
// Teacher: group
// ---------------------------------------------------------------------------

export type GroupStudent = { id: string; name: string; email: string; joinedAt: string; sharing: boolean; done: number }
export type InvitationRow = { id: string; code: string; role: string; uses: number; maxUses: number | null; expiresAt: string }
export type AssignmentRow = {
  id: string
  title: string
  kind: 'practice' | 'mock_exam' | 'text'
  status: 'draft' | 'published' | 'closed'
  dueAt: string | null
  points: number | null
  submitted: number
}

export async function loadGroup(admin: Db, m: Membership, userId: string, groupId: string) {
  if (!isId(groupId)) notFound()
  const teachable = await teachableGroupIds(admin, m, userId)
  if (!teachable.has(groupId)) notFound()
  const now = new Date().toISOString()
  const [group, members, invitations, assignments, sharing] = await Promise.all([
    admin.from('groups').select('id, name, description, subject').eq('id', groupId).eq('workspace_id', m.workspace.id).single(),
    admin.from('group_members').select('user_id, role, joined_at').eq('group_id', groupId).is('left_at', null),
    admin
      .from('workspace_invitations')
      .select('id, code, role, uses, max_uses, expires_at')
      .eq('group_id', groupId)
      .is('revoked_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false }),
    admin.from('assignments').select('id, title, kind, status, due_at, points').eq('group_id', groupId).order('created_at', { ascending: false }),
    admin.from('progress_sharing').select('student_id').eq('workspace_id', m.workspace.id).is('revoked_at', null),
  ])
  for (const r of [group, members, invitations, assignments, sharing]) if (r.error) throw r.error
  const asgIds = (assignments.data ?? []).map((a) => a.id)
  const subs = asgIds.length
    ? await admin.from('submissions').select('assignment_id, student_id, status').in('assignment_id', asgIds).neq('status', 'started')
    : { data: [] as Array<{ assignment_id: string; student_id: string; status: string }>, error: null }
  if (subs.error) throw subs.error
  const students = (members.data ?? []).filter((x) => x.role === 'student')
  const staff = (members.data ?? []).filter((x) => x.role !== 'student')
  const names = await profileNames(admin, (members.data ?? []).map((x) => x.user_id))
  const sharingSet = new Set((sharing.data ?? []).map((s) => s.student_id))
  return {
    group: group.data!,
    students: students
      .map<GroupStudent>((s) => ({
        id: s.user_id,
        name: names.get(s.user_id)?.name ?? '—',
        email: names.get(s.user_id)?.email ?? '',
        joinedAt: s.joined_at,
        sharing: sharingSet.has(s.user_id),
        done: (subs.data ?? []).filter((x) => x.student_id === s.user_id).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    staff: staff.map((s) => ({ id: s.user_id, name: names.get(s.user_id)?.name ?? '—', role: s.role })),
    invitations: (invitations.data ?? []).map<InvitationRow>((i) => ({ id: i.id, code: i.code, role: i.role, uses: i.uses, maxUses: i.max_uses, expiresAt: i.expires_at })),
    assignments: (assignments.data ?? []).map<AssignmentRow>((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind as AssignmentRow['kind'],
      status: a.status as AssignmentRow['status'],
      dueAt: a.due_at,
      points: a.points,
      submitted: (subs.data ?? []).filter((x) => x.assignment_id === a.id).length,
    })),
  }
}

// ---------------------------------------------------------------------------
// Assignment submissions (teacher) — mock-exam work is derived from completed attempts
// ---------------------------------------------------------------------------

export type SubmissionView = {
  studentId: string
  name: string
  status: 'not_started' | 'started' | 'submitted' | 'graded'
  submittedAt: string | null
  late: boolean
  score: number | null
  feedback: string | null
  textAnswer: string | null
  attemptId: string | null
  /** Mock exams: the SAT MASTER estimate range of the attempt (not an official score). */
  estimate: { low: number; high: number } | null
}

type AssignmentFull = {
  id: string
  workspace_id: string
  group_id: string
  title: string
  instructions: string
  kind: 'practice' | 'mock_exam' | 'text'
  practice_config: unknown
  mock_exam_id: string | null
  due_at: string | null
  points: number | null
  status: 'draft' | 'published' | 'closed'
  published_at: string | null
}

async function assignmentById(admin: Db, assignmentId: string): Promise<AssignmentFull | null> {
  if (!isId(assignmentId)) return null
  const { data, error } = await admin
    .from('assignments')
    .select('id, workspace_id, group_id, title, instructions, kind, practice_config, mock_exam_id, due_at, points, status, published_at')
    .eq('id', assignmentId)
    .maybeSingle()
  if (error) throw error
  return (data as AssignmentFull | null) ?? null
}

async function mockResults(admin: Db, a: AssignmentFull, studentIds: string[]) {
  const out = new Map<string, { attemptId: string; completedAt: string; low: number; high: number }>()
  if (a.kind !== 'mock_exam' || !a.mock_exam_id || !a.published_at || studentIds.length === 0) return out
  const { data, error } = await admin
    .from('attempts')
    .select('id, user_id, completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high')
    .eq('kind', 'mock_exam')
    .eq('mock_exam_id', a.mock_exam_id)
    .eq('status', 'completed')
    .in('user_id', studentIds)
    .gte('completed_at', a.published_at)
    .order('completed_at')
  if (error) throw error
  for (const r of data ?? []) {
    if (out.has(r.user_id)) continue // first completion after the assignment counts
    out.set(r.user_id, {
      attemptId: r.id,
      completedAt: r.completed_at as string,
      low: (r.rw_estimate_low ?? 0) + (r.math_estimate_low ?? 0),
      high: (r.rw_estimate_high ?? 0) + (r.math_estimate_high ?? 0),
    })
  }
  return out
}

export async function loadAssignmentForTeacher(admin: Db, m: Membership, userId: string, assignmentId: string) {
  const a = await assignmentById(admin, assignmentId)
  if (!a || a.workspace_id !== m.workspace.id) notFound()
  const teachable = await teachableGroupIds(admin, m, userId)
  if (!teachable.has(a.group_id)) notFound()
  const [members, subs, group] = await Promise.all([
    admin.from('group_members').select('user_id').eq('group_id', a.group_id).eq('role', 'student').is('left_at', null),
    admin.from('submissions').select('student_id, status, submitted_at, score, feedback, text_answer, attempt_id').eq('assignment_id', a.id),
    admin.from('groups').select('id, name').eq('id', a.group_id).single(),
  ])
  for (const r of [members, subs, group]) if (r.error) throw r.error
  const studentIds = [...new Set([...(members.data ?? []).map((x) => x.user_id), ...(subs.data ?? []).map((s) => s.student_id)])]
  const [names, mocks] = await Promise.all([profileNames(admin, studentIds), mockResults(admin, a, studentIds)])
  const subBy = new Map((subs.data ?? []).map((s) => [s.student_id, s]))
  const rows: SubmissionView[] = studentIds.map((id) => {
    const s = subBy.get(id)
    const mock = mocks.get(id)
    const submittedAt = mock?.completedAt ?? s?.submitted_at ?? null
    const status: SubmissionView['status'] = mock ? 'submitted' : ((s?.status as SubmissionView['status']) ?? 'not_started')
    return {
      studentId: id,
      name: names.get(id)?.name ?? '—',
      status,
      submittedAt,
      late: !!(submittedAt && a.due_at && submittedAt > a.due_at),
      score: s?.score === null || s?.score === undefined ? null : Number(s.score),
      feedback: s?.feedback ?? null,
      textAnswer: s?.text_answer ?? null,
      attemptId: mock?.attemptId ?? s?.attempt_id ?? null,
      estimate: mock ? { low: mock.low, high: mock.high } : null,
    }
  })
  rows.sort((x, y) => x.name.localeCompare(y.name))
  return { assignment: a, group: group.data!, rows }
}

// ---------------------------------------------------------------------------
// Teacher: one student (only the work in this workspace; own practice only with consent)
// ---------------------------------------------------------------------------

export async function loadStudentForTeacher(admin: Db, m: Membership, userId: string, studentId: string) {
  if (!isId(studentId)) notFound()
  const teachable = await teachableGroupIds(admin, m, userId)
  const { data: gm, error } = await admin
    .from('group_members')
    .select('group_id, groups!inner(name)')
    .eq('workspace_id', m.workspace.id)
    .eq('user_id', studentId)
    .eq('role', 'student')
    .is('left_at', null)
  if (error) throw error
  // A teacher sees a student only through a group they teach (managers: any group of the workspace).
  const groups = (gm ?? []).filter((g) => teachable.has(g.group_id)).map((g) => ({ id: g.group_id, name: (g.groups as unknown as { name: string }).name }))
  if (groups.length === 0) notFound()

  const [names, sharing, assignments] = await Promise.all([
    profileNames(admin, [studentId]),
    admin.from('progress_sharing').select('granted_at').eq('workspace_id', m.workspace.id).eq('student_id', studentId).is('revoked_at', null).maybeSingle(),
    admin.from('assignments').select('id, title, kind, due_at, points, group_id').in('group_id', groups.map((g) => g.id)).neq('status', 'draft').order('created_at', { ascending: false }),
  ])
  if (sharing.error) throw sharing.error
  if (assignments.error) throw assignments.error
  const ids = (assignments.data ?? []).map((a) => a.id)
  const subs = ids.length
    ? await admin.from('submissions').select('assignment_id, status, score, submitted_at').eq('student_id', studentId).in('assignment_id', ids)
    : { data: [] as Array<{ assignment_id: string; status: string; score: number | null; submitted_at: string | null }>, error: null }
  if (subs.error) throw subs.error
  const subBy = new Map((subs.data ?? []).map((s) => [s.assignment_id, s]))

  let learning: null | {
    lastActiveAt: string | null
    domains: Array<{ id: string; name: string; subjectCode: string; answered: number; accuracy: number | null }>
    latestEstimate: { low: number; high: number; at: string } | null
  } = null
  if (sharing.data) {
    const [perf, profile, est, taxonomy] = await Promise.all([
      admin.rpc('skill_performance', { p_user_id: studentId }),
      admin.from('profiles').select('last_active_at').eq('id', studentId).single(),
      admin
        .from('attempts')
        .select('completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high')
        .eq('user_id', studentId)
        .eq('status', 'completed')
        .not('rw_estimate_low', 'is', null)
        .not('math_estimate_low', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getTaxonomy(admin),
    ])
    if (perf.error) throw perf.error
    const byDomain = rollupByDomain((perf.data ?? []) as SkillPerfRow[])
    learning = {
      lastActiveAt: profile.data?.last_active_at ?? null,
      domains: taxonomy.domains.map((d) => {
        const t = byDomain.get(d.id)
        return { id: d.id, name: d.name, subjectCode: taxonomy.subjectById.get(d.subjectId)?.code ?? '', answered: t?.answered ?? 0, accuracy: t?.accuracy ?? null }
      }),
      latestEstimate: est.data
        ? {
            low: (est.data.rw_estimate_low ?? 0) + (est.data.math_estimate_low ?? 0),
            high: (est.data.rw_estimate_high ?? 0) + (est.data.math_estimate_high ?? 0),
            at: est.data.completed_at as string,
          }
        : null,
    }
  }

  return {
    student: { id: studentId, name: names.get(studentId)?.name ?? '—', email: names.get(studentId)?.email ?? '' },
    groups,
    sharing: !!sharing.data,
    work: (assignments.data ?? []).map((a) => {
      const s = subBy.get(a.id)
      return { id: a.id, title: a.title, kind: a.kind, dueAt: a.due_at, points: a.points, status: s?.status ?? 'not_started', score: s?.score === null || s?.score === undefined ? null : Number(s.score), submittedAt: s?.submitted_at ?? null }
    }),
    learning,
  }
}

// ---------------------------------------------------------------------------
// Team (staff list and staff invitations) — managers
// ---------------------------------------------------------------------------

export async function loadTeam(admin: Db, m: Membership) {
  const now = new Date().toISOString()
  const [members, invitations] = await Promise.all([
    admin.from('workspace_members').select('user_id, role, joined_at').eq('workspace_id', m.workspace.id).eq('status', 'active'),
    admin
      .from('workspace_invitations')
      .select('id, code, role, uses, max_uses, expires_at')
      .eq('workspace_id', m.workspace.id)
      .is('group_id', null)
      .is('revoked_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false }),
  ])
  if (members.error) throw members.error
  if (invitations.error) throw invitations.error
  const all = members.data ?? []
  const names = await profileNames(admin, all.filter((x) => x.role !== 'student').map((x) => x.user_id))
  return {
    staff: all
      .filter((x) => x.role !== 'student')
      .map((x) => ({ id: x.user_id, role: x.role as WorkspaceRole, name: names.get(x.user_id)?.name ?? '—', email: names.get(x.user_id)?.email ?? '', joinedAt: x.joined_at })),
    studentCount: all.filter((x) => x.role === 'student').length,
    invitations: (invitations.data ?? []).map<InvitationRow>((i) => ({ id: i.id, code: i.code, role: i.role, uses: i.uses, maxUses: i.max_uses, expiresAt: i.expires_at })),
  }
}

// ---------------------------------------------------------------------------
// Student side
// ---------------------------------------------------------------------------

export type StudentAssignment = {
  id: string
  title: string
  kind: 'practice' | 'mock_exam' | 'text'
  dueAt: string | null
  status: 'not_started' | 'started' | 'submitted' | 'graded' | 'closed'
  score: number | null
  points: number | null
  groupName: string
}

export async function loadMyClasses(admin: Db, userId: string) {
  const memberships = (await listMemberships(admin, userId)).filter((x) => x.role === 'student')
  const wsIds = memberships.map((x) => x.workspace.id)
  if (wsIds.length === 0) return { workspaces: [] as Array<{ workspace: Workspace; sharing: boolean; teachers: string[]; groups: Array<{ id: string; name: string }>; assignments: StudentAssignment[] }> }
  const [gm, staff, sharing] = await Promise.all([
    admin.from('group_members').select('group_id, workspace_id, groups!inner(name, status)').eq('user_id', userId).eq('role', 'student').is('left_at', null).in('workspace_id', wsIds).eq('groups.status', 'active'),
    admin.from('workspace_members').select('workspace_id, user_id, role').in('workspace_id', wsIds).eq('status', 'active').neq('role', 'student'),
    admin.from('progress_sharing').select('workspace_id').eq('student_id', userId).is('revoked_at', null),
  ])
  for (const r of [gm, staff, sharing]) if (r.error) throw r.error
  const groupIds = (gm.data ?? []).map((g) => g.group_id)
  const asg = groupIds.length
    ? await admin.from('assignments').select('id, title, kind, due_at, points, status, group_id, workspace_id, mock_exam_id, published_at').in('group_id', groupIds).neq('status', 'draft').order('due_at', { ascending: true, nullsFirst: false })
    : { data: [] as Array<{ id: string; title: string; kind: string; due_at: string | null; points: number | null; status: string; group_id: string; workspace_id: string; mock_exam_id: string | null; published_at: string | null }>, error: null }
  if (asg.error) throw asg.error
  const asgIds = (asg.data ?? []).map((a) => a.id)
  const subs = asgIds.length
    ? await admin.from('submissions').select('assignment_id, status, score').eq('student_id', userId).in('assignment_id', asgIds)
    : { data: [] as Array<{ assignment_id: string; status: string; score: number | null }>, error: null }
  if (subs.error) throw subs.error
  // Mock-exam assignments count as submitted once a matching exam is completed after they were set.
  const mockIds = (asg.data ?? []).filter((a) => a.kind === 'mock_exam' && a.mock_exam_id).map((a) => a.mock_exam_id!)
  const mockDone = mockIds.length
    ? await admin.from('attempts').select('mock_exam_id, completed_at').eq('user_id', userId).eq('kind', 'mock_exam').eq('status', 'completed').in('mock_exam_id', mockIds)
    : { data: [] as Array<{ mock_exam_id: string | null; completed_at: string | null }>, error: null }
  if (mockDone.error) throw mockDone.error

  const names = await profileNames(admin, (staff.data ?? []).map((s) => s.user_id))
  const subBy = new Map((subs.data ?? []).map((s) => [s.assignment_id, s]))
  const groupName = new Map((gm.data ?? []).map((g) => [g.group_id, (g.groups as unknown as { name: string }).name]))
  const sharingSet = new Set((sharing.data ?? []).map((s) => s.workspace_id))
  return {
    workspaces: memberships.map((ms) => ({
      workspace: ms.workspace,
      sharing: sharingSet.has(ms.workspace.id),
      teachers: (staff.data ?? []).filter((s) => s.workspace_id === ms.workspace.id).map((s) => names.get(s.user_id)?.name ?? '—'),
      groups: (gm.data ?? []).filter((g) => g.workspace_id === ms.workspace.id).map((g) => ({ id: g.group_id, name: groupName.get(g.group_id) ?? '' })),
      assignments: (asg.data ?? [])
        .filter((a) => a.workspace_id === ms.workspace.id)
        .map<StudentAssignment>((a) => {
          const s = subBy.get(a.id)
          const mockSubmitted =
            a.kind === 'mock_exam' && (mockDone.data ?? []).some((x) => x.mock_exam_id === a.mock_exam_id && !!x.completed_at && !!a.published_at && x.completed_at >= a.published_at)
          const status: StudentAssignment['status'] = mockSubmitted
            ? 'submitted'
            : s
              ? (s.status as StudentAssignment['status'])
              : a.status === 'closed'
                ? 'closed'
                : 'not_started'
          return { id: a.id, title: a.title, kind: a.kind as StudentAssignment['kind'], dueAt: a.due_at, status, score: s?.score === null || s?.score === undefined ? null : Number(s.score), points: a.points, groupName: groupName.get(a.group_id) ?? '' }
        }),
    })),
  }
}

/** One assignment for its student (404 unless the student is in the group and it is published). */
export async function loadMyAssignment(admin: Db, userId: string, assignmentId: string) {
  const a = await assignmentById(admin, assignmentId)
  if (!a || a.status === 'draft') notFound()
  const [{ data: member, error }, ws] = await Promise.all([
    admin.from('group_members').select('group_id').eq('group_id', a.group_id).eq('user_id', userId).eq('role', 'student').is('left_at', null).maybeSingle(),
    getMembership(admin, userId, a.workspace_id),
  ])
  if (error) throw error
  if (!member || !ws || ws.role !== 'student') notFound()
  const [{ data: sub }, mock, mockExam, group] = await Promise.all([
    admin.from('submissions').select('status, text_answer, score, feedback, submitted_at, graded_at, attempt_id').eq('assignment_id', a.id).eq('student_id', userId).maybeSingle(),
    mockResults(admin, a, [userId]),
    a.mock_exam_id ? admin.from('mock_exams').select('id, title').eq('id', a.mock_exam_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('groups').select('name').eq('id', a.group_id).single(),
  ])
  return { assignment: a, workspace: ws.workspace, groupName: group.data?.name ?? '', submission: sub ?? null, mock: mock.get(userId) ?? null, mockExam: mockExam.data ?? null }
}

export { assignmentById }
