/** Course pack files (content/courses/*.json): original text lessons shipped with the app. */
import { z } from 'zod'

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80)

export const bundledLessonSchema = z.object({
  slug,
  skill: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(300),
  objectives: z.array(z.string().min(5).max(200)).min(2).max(5),
  minutes: z.number().int().min(1).max(60),
  free_preview: z.boolean(),
  body: z.string().min(400).max(6000),
})

export const courseFileSchema = z.object({
  slug,
  subject: z.enum(['math', 'reading_writing']),
  title: z.string().min(3).max(160),
  description: z.string().max(600),
  lessons: z.array(bundledLessonSchema).min(1),
})
export type CourseFile = z.infer<typeof courseFileSchema>
