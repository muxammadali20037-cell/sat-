'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CONTENT_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { adminAction, check } from '@/features/admin/server-utils'
import { writeAudit } from '@/lib/audit'
import { courseFileSchema } from './bundle-schema'

/**
 * Loads the courses and text lessons shipped with the app (content/courses → bundled.generated.ts).
 * Adds only what is missing (matched by course slug and lesson slug); never changes or removes
 * existing courses or lessons, so edits made in the admin panel are kept. New ones are published.
 */
export async function importBundledCoursesAction(): Promise<ActionResult<{ courses: number; lessons: number; skipped: number }>> {
  return adminAction(CONTENT_ROLES, async ({ db, profile }) => {
    const { BUNDLED_COURSES_JSON } = await import('./bundled.generated')
    const parsed = z.array(courseFileSchema).safeParse(JSON.parse(BUNDLED_COURSES_JSON))
    if (!parsed.success) return { ok: false, error: 'The bundled course content is invalid. Rebuild it with scripts/courses/build.ts.' }

    const [{ data: subjects }, { data: skills }, { data: existing }] = await Promise.all([
      db.from('subjects').select('id, code'),
      db.from('skills').select('id, code'),
      db.from('courses').select('id, slug, lessons(slug)'),
    ])
    const subjectId = new Map((subjects ?? []).map((s) => [s.code, s.id]))
    const skillId = new Map((skills ?? []).map((s) => [s.code, s.id]))
    const bySlug = new Map((existing ?? []).map((c) => [c.slug, { id: c.id, lessons: new Set((c.lessons ?? []).map((l) => l.slug)) }]))
    const now = new Date().toISOString()
    let courses = 0
    let lessons = 0
    let skipped = 0

    for (const [ci, c] of parsed.data.entries()) {
      let target = bySlug.get(c.slug)
      if (!target) {
        const sid = subjectId.get(c.subject)
        if (!sid) {
          skipped += c.lessons.length
          continue
        }
        const { data } = check(
          await db.from('courses').insert({ subject_id: sid, slug: c.slug, title: c.title, description: c.description, status: 'published', position: ci, created_by: profile.id }).select('id').single(),
          { entity: 'course' },
        )
        target = { id: data!.id, lessons: new Set() }
        courses++
      }
      for (const [li, l] of c.lessons.entries()) {
        if (target.lessons.has(l.slug)) continue
        const sk = skillId.get(l.skill)
        if (!sk) {
          skipped++
          continue
        }
        const { data: row } = check(
          await db
            .from('lessons')
            .insert({
              course_id: target.id,
              skill_id: sk,
              slug: l.slug,
              title: l.title,
              description: l.description,
              objectives: l.objectives,
              video_provider: 'none',
              duration_seconds: l.minutes * 60,
              position: li + 1,
              is_free_preview: l.free_preview,
              // Draft first: a text lesson can only be published once its notes exist.
              status: 'draft',
              created_by: profile.id,
            })
            .select('id')
            .single(),
          { entity: 'lesson' },
        )
        try {
          check(await db.from('lesson_contents').insert({ lesson_id: row!.id, body: l.body }), { entity: 'lesson content' })
          check(await db.from('lessons').update({ status: 'published', published_at: now }).eq('id', row!.id), { entity: 'lesson' })
        } catch (err) {
          // Remove the half-created draft so the next import can add this lesson again.
          await db.from('lessons').delete().eq('id', row!.id)
          throw err
        }
        lessons++
      }
    }
    await writeAudit({ actorId: profile.id, actorRole: profile.role, action: 'course.import_bundled', entityType: 'course', summary: `Imported ${courses} course(s) and ${lessons} lesson(s)` })
    revalidatePath('/admin/courses')
    revalidatePath('/admin/lessons')
    revalidatePath('/dashboard/courses', 'layout')
    return { ok: true, data: { courses, lessons, skipped }, message: `Imported ${courses} course(s) and ${lessons} lesson(s)${skipped ? `; ${skipped} skipped` : ''}` }
  })
}

