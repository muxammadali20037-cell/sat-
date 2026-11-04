import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { localDate, addDays } from '@/lib/time'
import { profileNames } from './server'
import {
  challengeTiming,
  inRange,
  metricValue,
  progress,
  rankEntries,
  weekRange,
  weeklyPoints,
  type ActivityRow,
  type ChallengeMetric,
  type ChallengeProgress,
  type ChallengeTiming,
  type LeaderboardEntry,
} from './challenges'

export type ChallengeView = {
  id: string
  title: string
  metric: ChallengeMetric
  mode: 'individual' | 'group'
  target: number
  startsOn: string
  endsOn: string
  timing: ChallengeTiming
  /** Group mode: the sum over students who chose to be shown. */
  group: (ChallengeProgress & { counted: number }) | null
  /** The viewing student's own progress (always visible to them). */
  me: ChallengeProgress | null
  /** Named progress, only for students who chose to be shown (and, for staff, those sharing progress). */
  people: Array<{ studentId: string; name: string; progress: ChallengeProgress }>
}

export type Engagement = {
  week: { from: string; to: string }
  leaderboard: LeaderboardEntry[]
  /** The viewing student: own weekly numbers and whether they appear on the leaderboard. */
  me: { optedIn: boolean; points: number; correct: number; activeDays: number; classWork: number } | null
  hiddenCount: number
  challenges: ChallengeView[]
}

/**
 * A group's leaderboard and challenges as seen by `viewer`. The caller has already checked that the
 * viewer teaches the group (staff) or is a current student of it.
 */
export async function loadEngagement(
  admin: Db,
  input: { workspaceId: string; groupId: string; timeZone: string; viewer: { id: string; staff: boolean } },
): Promise<Engagement> {
  const today = localDate(input.timeZone)
  const week = weekRange(today)
  const [gm, challengesRes] = await Promise.all([
    admin.from('group_members').select('user_id').eq('group_id', input.groupId).eq('role', 'student').is('left_at', null),
    admin
      .from('class_challenges')
      .select('id, title, metric, mode, target, starts_on, ends_on, status')
      .eq('group_id', input.groupId)
      .gte('ends_on', addDays(today, -30))
      .order('ends_on', { ascending: false })
      .limit(10),
  ])
  if (gm.error) throw gm.error
  if (challengesRes.error) throw challengesRes.error
  const studentIds = (gm.data ?? []).map((x) => x.user_id)
  const challenges = challengesRes.data ?? []
  if (studentIds.length === 0) return { week, leaderboard: [], me: null, hiddenCount: 0, challenges: [] }

  const earliest = [week.from, ...challenges.map((c) => c.starts_on)].sort()[0]!
  const [members, sharing, activity, asg] = await Promise.all([
    admin.from('workspace_members').select('user_id, leaderboard_opt_in').eq('workspace_id', input.workspaceId).in('user_id', studentIds).eq('status', 'active'),
    admin.from('progress_sharing').select('student_id').eq('workspace_id', input.workspaceId).is('revoked_at', null),
    admin
      .from('user_daily_activity')
      .select('user_id, activity_date, study_seconds, questions_answered, correct_answers, lessons_completed')
      .in('user_id', studentIds)
      .gte('activity_date', earliest)
      .lte('activity_date', today),
    admin.from('assignments').select('id').eq('group_id', input.groupId),
  ])
  for (const r of [members, sharing, activity, asg]) if (r.error) throw r.error
  const asgIds = (asg.data ?? []).map((a) => a.id)
  const subs = asgIds.length
    ? await admin
        .from('submissions')
        .select('student_id, submitted_at')
        .in('assignment_id', asgIds)
        .in('status', ['submitted', 'graded'])
        .gte('submitted_at', `${week.from}T00:00:00Z`)
    : { data: [] as Array<{ student_id: string; submitted_at: string | null }>, error: null }
  if (subs.error) throw subs.error

  const optedIn = new Set((members.data ?? []).filter((m) => m.leaderboard_opt_in).map((m) => m.user_id))
  const sharingSet = new Set((sharing.data ?? []).map((s) => s.student_id))
  const names = await profileNames(admin, studentIds)
  const rowsBy = new Map<string, ActivityRow[]>()
  for (const r of (activity.data ?? []) as ActivityRow[]) rowsBy.set(r.user_id, [...(rowsBy.get(r.user_id) ?? []), r])
  const workBy = new Map<string, number>()
  for (const s of subs.data ?? []) workBy.set(s.student_id, (workBy.get(s.student_id) ?? 0) + 1)
  const name = (sid: string) => names.get(sid)?.name ?? '—'
  const viewerIsStudent = !input.viewer.staff && studentIds.includes(input.viewer.id)

  const weekly = (sid: string) => weeklyPoints(inRange(rowsBy.get(sid) ?? [], week.from, week.to), workBy.get(sid) ?? 0)
  const leaderboard = rankEntries(
    [...optedIn].map((sid) => ({ studentId: sid, name: name(sid), self: sid === input.viewer.id, ...weekly(sid) })),
  )
  const me = viewerIsStudent ? { optedIn: optedIn.has(input.viewer.id), ...weekly(input.viewer.id) } : null

  // Named progress: opted-in students for everyone; staff also see students who share their progress.
  const visible = (sid: string) => optedIn.has(sid) || (input.viewer.staff && sharingSet.has(sid))
  const views: ChallengeView[] = challenges.map((c) => {
    const metric = c.metric as ChallengeMetric
    const valueOf = (sid: string) => metricValue(metric, inRange(rowsBy.get(sid) ?? [], c.starts_on, c.ends_on))
    const counted = studentIds.filter((sid) => optedIn.has(sid))
    return {
      id: c.id,
      title: c.title,
      metric,
      mode: c.mode as 'individual' | 'group',
      target: c.target,
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      timing: challengeTiming(c.starts_on, c.ends_on, today, c.status),
      group: c.mode === 'group' ? { ...progress(counted.reduce((s, sid) => s + valueOf(sid), 0), c.target), counted: counted.length } : null,
      me: viewerIsStudent ? progress(valueOf(input.viewer.id), c.target) : null,
      people:
        c.mode === 'individual'
          ? studentIds
              .filter(visible)
              .map((sid) => ({ studentId: sid, name: name(sid), progress: progress(valueOf(sid), c.target) }))
              .sort((a, b) => b.progress.value - a.progress.value || a.name.localeCompare(b.name))
          : [],
    }
  })

  return { week, leaderboard, me, hiddenCount: studentIds.length - optedIn.size, challenges: views }
}
