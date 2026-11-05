import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { localDate } from '@/lib/time'
import { estimatePoints, latestEstimate } from '@/features/dashboard/logic'
import { longestStreak } from '@/features/dashboard/achievements'
import { buildPath, type PathStats, type PathView } from './stages'

function count(res: { count: number | null; error: unknown }): number {
  if (res.error) throw res.error
  return res.count ?? 0
}

/**
 * The student's own records for the path. User-scoped client (RLS: own rows only); only counts and
 * the latest estimate are read. The streak RPC runs with the service role for this user only.
 */
export async function loadPathStats(db: Db, admin: Db, userId: string, timezone: string): Promise<PathStats> {
  const correct = (difficulty: 'easy' | 'medium' | 'hard') =>
    db
      .from('attempt_answers')
      .select('id, questions!inner(difficulty), attempts!inner(status)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_correct', true)
      .eq('questions.difficulty', difficulty)
      .eq('attempts.status', 'completed')
  const [estRes, diag, lessons, easy, medium, hard, mocks, activityRes, streakRes, words] = await Promise.all([
    db
      .from('attempts')
      .select('id, kind, completed_at, rw_estimate_low, rw_estimate_high, math_estimate_low, math_estimate_high')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .in('kind', ['diagnostic', 'mock_exam'])
      .not('rw_estimate_low', 'is', null)
      .not('math_estimate_low', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1),
    db.from('attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'diagnostic').eq('status', 'completed'),
    db.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('completed_at', 'is', null),
    correct('easy'),
    correct('medium'),
    correct('hard'),
    db.from('attempts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'mock_exam').eq('status', 'completed'),
    db.from('user_daily_activity').select('activity_date, study_seconds, questions_answered, lessons_completed').eq('user_id', userId),
    admin.rpc('activity_streak', { p_user_id: userId, p_today: localDate(timezone) }),
    db.from('vocab_words').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ])
  if (estRes.error) throw estRes.error
  if (activityRes.error) throw activityRes.error
  if (streakRes.error) throw streakRes.error
  const total = latestEstimate(estimatePoints(estRes.data ?? [])).total
  return {
    estimate: total ? total.mid : null,
    diagnosticsCompleted: count(diag),
    lessonsCompleted: count(lessons),
    correct: { easy: count(easy), medium: count(medium), hard: count(hard) },
    mocksCompleted: count(mocks),
    longestStreak: Math.max(Number(streakRes.data ?? 0), longestStreak(activityRes.data ?? [])),
    words: count(words),
  }
}

export async function loadPath(db: Db, admin: Db, userId: string, timezone: string): Promise<{ stats: PathStats; path: PathView }> {
  const stats = await loadPathStats(db, admin, userId, timezone)
  return { stats, path: buildPath(stats) }
}
