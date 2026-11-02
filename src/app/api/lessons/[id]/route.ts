import { route } from '@/lib/api/route'
import { notFoundError } from '@/lib/api/errors'
import { getLessonView } from '@/features/lessons/server'

/**
 * GET /api/lessons/[id] — published lesson metadata, objectives, resources, own progress and
 * prev/next. Notes (`body`) and a short-lived `playback` source are included only when the
 * student's plan includes video lessons or the lesson is a free preview; otherwise `locked: true`.
 */
export const GET = route({
  auth: 'user',
  handler: async ({ params, db, admin, profile }) => {
    const view = await getLessonView({ db, admin, user: { id: profile.id, role: profile.role }, lessonId: params.id ?? '' })
    if (!view) throw notFoundError('Lesson')
    return view
  },
})
