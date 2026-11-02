'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CONTENT_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { adminAction, check } from '@/features/admin/server-utils'
import { issuesToFieldErrors, summarizeFieldErrors } from './form-errors'
import {
  CourseInputSchema,
  DomainCreateSchema,
  DomainUpdateSchema,
  SkillCreateSchema,
  SkillUpdateSchema,
  SubjectUpdateSchema,
} from './schemas'

/** Curriculum CRUD (subjects, domains, skills, courses). RLS allows writes for content managers only. */

function invalid(error: z.ZodError): { ok: false; error: string; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> } {
  const fieldErrors = issuesToFieldErrors(error.issues)
  return { ok: false, error: summarizeFieldErrors(fieldErrors), code: 'VALIDATION_FAILED', fieldErrors }
}

function revalidateTaxonomy() {
  for (const p of ['/admin/subjects', '/admin/domains', '/admin/skills', '/admin/questions', '/admin/question-import']) revalidatePath(p)
}

export async function updateSubject(input: unknown): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = SubjectUpdateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const { id, ...values } = parsed.data
    const { data } = check(await db.from('subjects').update(values).eq('id', id).select('id'), { entity: 'subject' })
    if (!data?.length) return { ok: false, error: 'This subject no longer exists.' }
    revalidateTaxonomy()
    return { ok: true, message: 'Saved' }
  })
}

export async function createDomain(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = DomainCreateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const { data } = check(await db.from('domains').insert(parsed.data).select('id').single(), {
      entity: 'domain',
      duplicate: 'A domain with this code already exists.',
    })
    revalidateTaxonomy()
    return { ok: true, data: { id: data!.id }, message: 'Domain created' }
  })
}

export async function updateDomain(input: unknown): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = DomainUpdateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const { id, ...values } = parsed.data
    const { data } = check(await db.from('domains').update(values).eq('id', id).select('id'), { entity: 'domain' })
    if (!data?.length) return { ok: false, error: 'This domain no longer exists.' }
    revalidateTaxonomy()
    return { ok: true, message: 'Saved' }
  })
}

export async function deleteDomain(id: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid domain.' }
    const { data } = check(await db.from('domains').delete().eq('id', id).select('id'), {
      entity: 'domain',
      inUse: 'This domain still has skills, questions or results. Move or delete them first.',
    })
    if (!data?.length) return { ok: false, error: 'This domain no longer exists.' }
    revalidateTaxonomy()
    return { ok: true, message: 'Domain deleted' }
  })
}

export async function createSkill(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = SkillCreateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const { data } = check(await db.from('skills').insert(parsed.data).select('id').single(), {
      entity: 'skill',
      duplicate: 'A skill with this code already exists.',
    })
    revalidateTaxonomy()
    return { ok: true, data: { id: data!.id }, message: 'Skill created' }
  })
}

export async function updateSkill(input: unknown): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = SkillUpdateSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const { id, ...values } = parsed.data
    const { data } = check(await db.from('skills').update(values).eq('id', id).select('id'), { entity: 'skill' })
    if (!data?.length) return { ok: false, error: 'This skill no longer exists.' }
    revalidateTaxonomy()
    return { ok: true, message: 'Saved' }
  })
}

export async function deleteSkill(id: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid skill.' }
    const { data } = check(await db.from('skills').delete().eq('id', id).select('id'), {
      entity: 'skill',
      inUse: 'This skill is used by questions or practice sets. Move them to another skill first.',
    })
    if (!data?.length) return { ok: false, error: 'This skill no longer exists.' }
    revalidateTaxonomy()
    return { ok: true, message: 'Skill deleted' }
  })
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

function revalidateCourses(id?: string) {
  revalidatePath('/admin/courses')
  revalidatePath('/admin/lessons')
  if (id) revalidatePath(`/admin/courses/${id}`)
}

export async function saveCourse(input: unknown, id?: string | null): Promise<ActionResult<{ id: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db, profile }) => {
    const parsed = CourseInputSchema.safeParse(input)
    if (!parsed.success) return invalid(parsed.error)
    const values = { ...parsed.data, archived_at: parsed.data.status === 'archived' ? new Date().toISOString() : null }
    if (id) {
      if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid course.' }
      const { data } = check(await db.from('courses').update(values).eq('id', id).select('id'), {
        entity: 'course',
        duplicate: 'A course with this slug already exists.',
      })
      if (!data?.length) return { ok: false, error: 'This course no longer exists.' }
      revalidateCourses(id)
      return { ok: true, data: { id }, message: 'Saved' }
    }
    const { data } = check(await db.from('courses').insert({ ...values, created_by: profile.id }).select('id').single(), {
      entity: 'course',
      duplicate: 'A course with this slug already exists.',
    })
    revalidateCourses(data!.id)
    return { ok: true, data: { id: data!.id }, message: 'Course created' }
  })
}

export async function setCourseStatus(id: string, status: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = z.object({ id: z.guid(), status: z.enum(['draft', 'published', 'archived']) }).safeParse({ id, status })
    if (!parsed.success) return { ok: false, error: 'Invalid status change.' }
    const { data } = check(
      await db
        .from('courses')
        .update({ status: parsed.data.status, archived_at: parsed.data.status === 'archived' ? new Date().toISOString() : null })
        .eq('id', parsed.data.id)
        .select('id'),
      { entity: 'course' },
    )
    if (!data?.length) return { ok: false, error: 'This course no longer exists.' }
    revalidateCourses(parsed.data.id)
    return { ok: true, message: { draft: 'Moved to draft', published: 'Published', archived: 'Archived' }[parsed.data.status] }
  })
}

export async function deleteCourse(id: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid course.' }
    const { data } = check(await db.from('courses').delete().eq('id', id).select('id'), {
      entity: 'course',
      inUse: 'This course still has lessons. Delete or move them first, or archive the course instead.',
    })
    if (!data?.length) return { ok: false, error: 'This course no longer exists.' }
    revalidateCourses()
    return { ok: true, message: 'Course deleted' }
  })
}
