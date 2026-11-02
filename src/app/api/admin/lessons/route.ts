import { revalidatePath } from 'next/cache'
import { route } from '@/lib/api/route'
import { CONTENT_ROLES } from '@/config/roles'
import { LessonInputSchema } from '@/features/content/schemas'
import { createLesson } from '@/features/content/lessons-server'
import { toApiError } from '@/features/admin/server-utils'

/** POST /api/admin/lessons — create a draft lesson with its notes and video reference. */
export const POST = route({
  auth: CONTENT_ROLES,
  body: LessonInputSchema,
  handler: async ({ db, body, profile }) => {
    try {
      const id = await createLesson(db, body, profile.id)
      revalidatePath('/admin/lessons')
      return { id, status: 'draft' }
    } catch (err) {
      throw toApiError(err)
    }
  },
})
