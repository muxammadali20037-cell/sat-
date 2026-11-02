import { z } from 'zod'
import { route } from '@/lib/api/route'
import { ApiError, notFoundError } from '@/lib/api/errors'
import { RATE_LIMITS } from '@/lib/security/rate-limit'
import { recordActivity } from '@/features/activity/server'
import { lessonKindFromProvider } from '@/features/courses/catalog'
import { canAccessLesson, getCompletionRatio, getPublishedLesson } from '@/features/lessons/server'
import { computeProgressUpdate } from '@/features/lessons/progress'
import type { ProgressResponse } from '@/features/lessons/types'

const ProgressSchema = z.object({
  positionSeconds: z.number().finite().min(0).max(86_400),
  event: z.enum(['heartbeat', 'pause', 'ended', 'complete']),
})

/**
 * POST /api/lessons/[id]/progress — heartbeat `{ positionSeconds, event }`.
 * Credits only forward progress the server's own clock can account for (features/lessons/progress.ts).
 * Writes are conditional on the previous heartbeat timestamp, so two concurrent requests can never
 * both be credited for the same interval.
 */
export const POST = route({
  auth: 'user',
  body: ProgressSchema,
  rateLimit: RATE_LIMITS.progress,
  handler: async ({ params, body, db, admin, profile }): Promise<ProgressResponse> => {
    const lesson = await getPublishedLesson(db, params.id ?? '')
    if (!lesson) throw notFoundError('Lesson')
    if (!(await canAccessLesson({ id: profile.id, role: profile.role }, lesson))) {
      throw new ApiError(402, 'PLAN_REQUIRED', 'This lesson is part of a paid plan.', { feature: 'video_lessons' })
    }

    const ratio = await getCompletionRatio(db)
    const kind = lessonKindFromProvider(lesson.video_provider)
    const { data: row, error: readError } = await db
      .from('lesson_progress')
      .select('id, last_position_seconds, watched_seconds, last_heartbeat_at, completed_at')
      .eq('user_id', profile.id)
      .eq('lesson_id', lesson.id)
      .maybeSingle()
    if (readError) throw readError

    const now = new Date()
    const update = computeProgressUpdate(
      row
        ? {
            lastPositionSeconds: row.last_position_seconds,
            watchedSeconds: row.watched_seconds,
            lastHeartbeatAt: row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : null,
            completedAt: row.completed_at ? new Date(row.completed_at) : null,
          }
        : null,
      body,
      now,
      lesson.duration_seconds,
      ratio,
      kind,
    )

    const values = {
      last_position_seconds: update.lastPositionSeconds,
      watched_seconds: update.watchedSeconds,
      last_heartbeat_at: update.lastHeartbeatAt?.toISOString() ?? null,
      completed_at: update.completedAt?.toISOString() ?? null,
    }
    const changed =
      !row ||
      update.accepted ||
      values.completed_at !== row.completed_at ||
      values.watched_seconds !== row.watched_seconds

    let written = true
    if (changed) {
      const service = admin()
      if (!row) {
        const { error } = await service.from('lesson_progress').insert({ user_id: profile.id, lesson_id: lesson.id, ...values })
        if (error) {
          if (error.code !== '23505') throw error
          written = false // a concurrent first heartbeat won the race
        }
      } else {
        let q = service.from('lesson_progress').update(values).eq('id', row.id).eq('user_id', profile.id)
        q = row.last_heartbeat_at ? q.eq('last_heartbeat_at', row.last_heartbeat_at) : q.is('last_heartbeat_at', null)
        const { data, error } = await q.select('id')
        if (error) throw error
        written = (data?.length ?? 0) > 0 // 0 rows: another heartbeat updated first; credit nothing
      }
    }

    if (written && (update.creditedSeconds > 0 || update.newlyCompleted)) {
      await recordActivity(profile.id, profile.timezone, {
        studySeconds: update.creditedSeconds,
        lessons: update.newlyCompleted ? 1 : 0,
      })
    }

    const effective = written ? values : row ? row : values
    return {
      watchedSeconds: effective.watched_seconds,
      lastPositionSeconds: effective.last_position_seconds,
      thresholdSeconds: update.thresholdSeconds,
      canComplete: effective.watched_seconds >= update.thresholdSeconds,
      completed: effective.completed_at !== null,
      completedAt: effective.completed_at,
      newlyCompleted: written && update.newlyCompleted,
      completeRejected: update.completeRejected,
      creditedSeconds: written ? update.creditedSeconds : 0,
    }
  },
})
