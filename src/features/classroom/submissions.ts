import 'server-only'
import type { Db } from '@/lib/supabase/server'

/**
 * Called when a practice session that was started from an assignment finishes: the student's
 * submission becomes "submitted" with a score from the server-scored answers. Points scale the
 * score when the teacher set them; otherwise it is a percentage.
 */
export async function completeAssignmentPractice(
  admin: Db,
  studentId: string,
  assignmentId: string,
  attemptId: string,
  counters: { answeredCount: number; correctCount: number },
): Promise<void> {
  try {
    const [{ data: a }, { data: attempt }] = await Promise.all([
      admin.from('assignments').select('points').eq('id', assignmentId).maybeSingle(),
      admin.from('attempts').select('total_questions').eq('id', attemptId).eq('user_id', studentId).maybeSingle(),
    ])
    const total = Math.max(1, attempt?.total_questions ?? counters.answeredCount)
    const scale = a?.points ?? 100
    const score = Math.round((counters.correctCount / total) * scale * 100) / 100
    const { error } = await admin
      .from('submissions')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), score })
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .eq('attempt_id', attemptId)
      .eq('status', 'started')
    if (error) throw error
  } catch (err) {
    // The practice result itself is already saved; the teacher view also derives it from the attempt.
    console.error('[classroom] could not mark the assignment submitted', { assignmentId, err })
  }
}
