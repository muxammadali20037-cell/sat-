import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { profileNames } from './server'
import { staffView, studentView, type PollRow, type StaffPollView, type StudentPollView } from './polls'

/** Poll loaders (service role). Callers must already have checked the user's access to the group. */

const COLS = 'id, kind, question, options, correct_index, status, created_at, closed_at, session_id, group_id'

async function answersFor(admin: Db, pollIds: string[]) {
  if (!pollIds.length) return [] as Array<{ poll_id: string; student_id: string; choice: number }>
  const { data, error } = await admin.from('class_poll_answers').select('poll_id, student_id, choice').in('poll_id', pollIds)
  if (error) throw error
  return data ?? []
}

/** Staff: every poll of a group (or of one lesson) with counts and who answered what. */
export async function loadStaffPolls(admin: Db, groupId: string, opts: { sessionId?: string; limit?: number } = {}): Promise<StaffPollView[]> {
  let q = admin.from('class_polls').select(COLS).eq('group_id', groupId).order('created_at', { ascending: false }).limit(opts.limit ?? 20)
  if (opts.sessionId) q = q.eq('session_id', opts.sessionId)
  const [{ data: polls, error }, members] = await Promise.all([
    q,
    admin.from('group_members').select('user_id').eq('group_id', groupId).eq('role', 'student').is('left_at', null),
  ])
  if (error) throw error
  if (members.error) throw members.error
  const ids = (members.data ?? []).map((m) => m.user_id)
  const [answers, names] = await Promise.all([answersFor(admin, (polls ?? []).map((p) => p.id)), profileNames(admin, ids)])
  const roster = ids.map((id) => ({ id, name: names.get(id)?.name ?? '—' })).sort((a, b) => a.name.localeCompare(b.name))
  return (polls ?? []).map((p) =>
    staffView(
      p as PollRow,
      answers.filter((a) => a.poll_id === p.id),
      roster,
    ),
  )
}

/** Student: polls of their current groups (or of one lesson), shaped so open polls reveal nothing. */
export async function loadStudentPolls(admin: Db, userId: string, groupIds: string[], opts: { sessionId?: string; limit?: number } = {}): Promise<Array<StudentPollView & { groupId: string }>> {
  if (!groupIds.length) return []
  let q = admin.from('class_polls').select(COLS).in('group_id', groupIds).order('created_at', { ascending: false }).limit(opts.limit ?? 20)
  if (opts.sessionId) q = q.eq('session_id', opts.sessionId)
  const { data: polls, error } = await q
  if (error) throw error
  const answers = await answersFor(admin, (polls ?? []).map((p) => p.id))
  return (polls ?? []).map((p) => {
    const mine = answers.find((a) => a.poll_id === p.id && a.student_id === userId)
    return {
      ...studentView(
        p as PollRow,
        mine?.choice ?? null,
        answers.filter((a) => a.poll_id === p.id).map((a) => a.choice),
      ),
      groupId: p.group_id,
    }
  })
}
