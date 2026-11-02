import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { route } from '@/lib/api/route'
import { ApiError } from '@/lib/api/errors'
import { CONTENT_ROLES } from '@/config/roles'
import { QuestionInputSchema } from '@/features/content/question-schema'
import { saveQuestion } from '@/features/content/questions-server'
import { toApiError } from '@/features/admin/server-utils'

/** PATCH /api/admin/questions/:id — full update; the question keeps its workflow status. */
export const PATCH = route({
  auth: CONTENT_ROLES,
  body: QuestionInputSchema,
  handler: async ({ db, body, params }) => {
    const id = z.guid().safeParse(params.id)
    if (!id.success) throw new ApiError(404, 'NOT_FOUND', 'Question not found.')
    try {
      const saved = await saveQuestion(db, body, id.data)
      revalidatePath('/admin/questions')
      revalidatePath(`/admin/questions/${id.data}`)
      return { id: saved.id, status: saved.status }
    } catch (err) {
      throw toApiError(err)
    }
  },
})
