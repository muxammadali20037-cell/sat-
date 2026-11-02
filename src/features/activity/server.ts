import 'server-only'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { localDate } from '@/lib/time'

/** Accumulate daily activity (streaks, study time, dashboard counters). Never throws. */
export async function recordActivity(
  userId: string,
  timeZone: string,
  delta: { studySeconds?: number; questions?: number; correct?: number; lessons?: number },
): Promise<void> {
  try {
    const admin = createAdminSupabase()
    const { error } = await admin.rpc('record_daily_activity', {
      p_user_id: userId,
      p_date: localDate(timeZone),
      p_study_seconds: Math.max(0, Math.round(delta.studySeconds ?? 0)),
      p_questions: Math.max(0, delta.questions ?? 0),
      p_correct: Math.max(0, delta.correct ?? 0),
      p_lessons: Math.max(0, delta.lessons ?? 0),
    })
    if (error) throw error
  } catch (err) {
    console.error('[activity] failed to record activity', err)
  }
}
