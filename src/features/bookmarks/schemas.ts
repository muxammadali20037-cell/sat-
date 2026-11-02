import { z } from 'zod'

export const ToggleBookmarkSchema = z.union([
  z.strictObject({ questionId: z.guid() }),
  z.strictObject({ lessonId: z.guid() }),
])
export type ToggleBookmarkInput = z.infer<typeof ToggleBookmarkSchema>

export const DeleteBookmarkQuery = z.object({ id: z.guid() })
