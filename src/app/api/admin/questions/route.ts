import { revalidatePath } from 'next/cache'
import { route } from '@/lib/api/route'
import { CONTENT_ROLES } from '@/config/roles'
import { QuestionInputSchema } from '@/features/content/question-schema'
import { saveQuestion } from '@/features/content/questions-server'
import { toApiError } from '@/features/admin/server-utils'

/** POST /api/admin/questions — create a draft question (same schema as the editor). */
export const POST = route({
  auth: CONTENT_ROLES,
  body: QuestionInputSchema,
  handler: async ({ db, body }) => {
    try {
      const saved = await saveQuestion(db, body, null)
      revalidatePath('/admin/questions')
      return { id: saved.id, status: saved.status }
    } catch (err) {
      throw toApiError(err)
    }
  },
})
