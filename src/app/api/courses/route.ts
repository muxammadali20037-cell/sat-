import { route } from '@/lib/api/route'
import { loadCatalog } from '@/features/courses/server'

/** GET /api/courses — published courses with lesson counts and the caller's own progress. */
export const GET = route({
  auth: 'user',
  handler: async ({ db, user }) => {
    const catalog = await loadCatalog(db, user.id)
    return {
      courses: catalog.courses.map((c) => ({
        id: c.id,
        slug: c.slug,
        title: c.title,
        description: c.description,
        level: c.level,
        subject: c.subjectCode,
        lessonCount: c.summary.total,
        totalDurationSeconds: c.summary.totalDurationSeconds,
        progress: {
          completed: c.summary.completed,
          inProgress: c.summary.inProgress,
          ratio: c.summary.ratio,
        },
        lessons: c.lessons.map((l) => {
          const p = catalog.progress.get(l.id)
          return {
            id: l.id,
            title: l.title,
            skillId: l.skillId,
            kind: l.kind,
            durationSeconds: l.durationSeconds,
            isFreePreview: l.isFreePreview,
            completed: p?.completed ?? false,
            watchedSeconds: p?.watchedSeconds ?? 0,
          }
        }),
      })),
    }
  },
})
