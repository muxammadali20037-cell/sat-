'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CONTENT_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { adminAction, check } from '@/features/admin/server-utils'
import { issuesToFieldErrors, summarizeFieldErrors } from '@/features/content/form-errors'
import { GUIDE_KINDS, GUIDE_LOCALES, guideFileSchema, localeContentSchema, skillGuideGaps } from './schema'

const metaSchema = z
  .object({
    slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').max(80),
    kind: z.enum(GUIDE_KINDS),
    skillId: z.guid().nullable(),
    subjectCode: z.enum(['math', 'reading_writing']).nullable(),
    position: z.coerce.number().int().min(0).max(999),
    readingMinutes: z.coerce.number().int().min(1).max(60),
  })
  .superRefine((m, ctx) => {
    if (m.kind === 'skill' && !m.skillId) ctx.addIssue({ code: 'custom', path: ['skillId'], message: 'Choose the skill this guide explains' })
    if (m.kind === 'strategy' && m.skillId) ctx.addIssue({ code: 'custom', path: ['skillId'], message: 'Strategy guides are not tied to a skill' })
  })

function revalidateGuides(id?: string) {
  revalidatePath('/admin/guides')
  revalidatePath('/dashboard/guides', 'layout')
  if (id) revalidatePath(`/admin/guides/${id}`)
}

/** Create (no id) or update a guide's settings. */
export async function saveGuideMetaAction(input: unknown, id?: string | null): Promise<ActionResult<{ id: string }>> {
  return adminAction(CONTENT_ROLES, async ({ db, profile }) => {
    const parsed = metaSchema.safeParse(input)
    if (!parsed.success) {
      const fieldErrors = issuesToFieldErrors(parsed.error.issues)
      return { ok: false, error: summarizeFieldErrors(fieldErrors), code: 'VALIDATION_FAILED', fieldErrors }
    }
    const m = parsed.data
    let subjectId: string | null = null
    if (m.subjectCode) {
      const { data } = check(await db.from('subjects').select('id').eq('code', m.subjectCode).maybeSingle(), { entity: 'subject' })
      subjectId = data?.id ?? null
    }
    if (m.kind === 'skill' && m.skillId) {
      // Skill guides inherit the subject of their skill.
      const { data } = check(await db.from('skills').select('domains(subject_id)').eq('id', m.skillId).maybeSingle(), { entity: 'skill' })
      const domain = data?.domains as { subject_id: string } | { subject_id: string }[] | null | undefined
      subjectId = (Array.isArray(domain) ? domain[0]?.subject_id : domain?.subject_id) ?? subjectId
    }
    const row = {
      slug: m.slug,
      kind: m.kind,
      skill_id: m.kind === 'skill' ? m.skillId : null,
      subject_id: subjectId,
      position: m.position,
      reading_minutes: m.readingMinutes,
    }
    if (id) {
      if (!z.guid().safeParse(id).success) return { ok: false, error: 'Invalid guide.' }
      const { data } = check(await db.from('guides').update(row).eq('id', id).select('id'), { entity: 'guide' })
      if (!data?.length) return { ok: false, error: 'This guide no longer exists.' }
      revalidateGuides(id)
      return { ok: true, data: { id }, message: 'Saved' }
    }
    const { data } = check(await db.from('guides').insert({ ...row, created_by: profile.id }).select('id').single(), { entity: 'guide' })
    if (!data) return { ok: false, error: 'The guide could not be created.' }
    revalidateGuides(data.id)
    return { ok: true, data: { id: data.id }, message: 'Guide created' }
  })
}

const contentInput = z.object({
  guideId: z.guid(),
  locale: z.enum(GUIDE_LOCALES),
  title: z.string(),
  summary: z.string(),
  sectionsJson: z.string().max(200_000),
})

/** Save one language version. Sections are validated with the same schema as the content files. */
export async function saveGuideContentAction(input: unknown): Promise<ActionResult<{ warnings: string[] }>> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const base = contentInput.safeParse(input)
    if (!base.success) return { ok: false, error: 'Invalid request.', code: 'VALIDATION_FAILED' }
    let sections: unknown
    try {
      sections = JSON.parse(base.data.sectionsJson)
    } catch (e) {
      return { ok: false, error: `Sections are not valid JSON: ${(e as Error).message}`, code: 'VALIDATION_FAILED', fieldErrors: { sections: ['Invalid JSON'] } }
    }
    const parsed = localeContentSchema.safeParse({ title: base.data.title, summary: base.data.summary, sections })
    if (!parsed.success) {
      const fieldErrors = issuesToFieldErrors(parsed.error.issues)
      return { ok: false, error: summarizeFieldErrors(fieldErrors), code: 'VALIDATION_FAILED', fieldErrors }
    }
    const { data: guide } = check(await db.from('guides').select('kind').eq('id', base.data.guideId).maybeSingle(), { entity: 'guide' })
    if (!guide) return { ok: false, error: 'This guide no longer exists.' }

    check(
      await db
        .from('guide_contents')
        .upsert(
          { guide_id: base.data.guideId, locale: base.data.locale, title: parsed.data.title, summary: parsed.data.summary, sections: parsed.data.sections },
          { onConflict: 'guide_id,locale' },
        ),
      { entity: 'guide content' },
    )
    revalidateGuides(base.data.guideId)
    const warnings = guide.kind === 'skill' ? skillGuideGaps(parsed.data) : []
    return { ok: true, data: { warnings }, message: warnings.length ? `Saved with ${warnings.length} editorial warning(s)` : 'Saved' }
  })
}

export async function deleteGuideContentAction(guideId: string, locale: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = z.object({ guideId: z.guid(), locale: z.enum(GUIDE_LOCALES) }).safeParse({ guideId, locale })
    if (!parsed.success) return { ok: false, error: 'Invalid request.' }
    const { data: guide } = check(await db.from('guides').select('status').eq('id', guideId).maybeSingle(), { entity: 'guide' })
    if (!guide) return { ok: false, error: 'This guide no longer exists.' }
    const { count } = check(await db.from('guide_contents').select('id', { count: 'exact', head: true }).eq('guide_id', guideId), { entity: 'guide content' })
    if (guide.status === 'published' && (count ?? 0) <= 1) return { ok: false, error: 'A published guide needs at least one language. Unpublish it first.' }
    check(await db.from('guide_contents').delete().eq('guide_id', guideId).eq('locale', parsed.data.locale), { entity: 'guide content' })
    revalidateGuides(guideId)
    return { ok: true, message: 'Language version removed' }
  })
}

/** Publish / unpublish / archive. The database refuses to publish a guide without content. */
export async function setGuideStatusAction(id: string, status: string): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ db }) => {
    const parsed = z.object({ id: z.guid(), status: z.enum(['draft', 'published', 'archived']) }).safeParse({ id, status })
    if (!parsed.success) return { ok: false, error: 'Invalid status change.' }
    const { data } = check(await db.from('guides').update({ status: parsed.data.status }).eq('id', parsed.data.id).select('id'), { entity: 'guide' })
    if (!data?.length) return { ok: false, error: 'This guide no longer exists.' }
    revalidateGuides(parsed.data.id)
    return { ok: true, message: { draft: 'Unpublished', published: 'Published', archived: 'Archived' }[parsed.data.status] }
  })
}

/**
 * Loads the guides bundled with the app (content/guides → bundled.generated.ts) into this
 * environment: inserts missing guides and missing language versions only — existing guides and any
 * edits made here are never overwritten — then publishes the guides it created.
 */
export async function importBundledGuidesAction(): Promise<ActionResult<{ created: number; languagesAdded: number; skipped: number }>> {
  return adminAction(CONTENT_ROLES, async ({ db, profile }) => {
    const { BUNDLED_GUIDES_JSON } = await import('./bundled.generated')
    const parsed = z.array(guideFileSchema).safeParse(JSON.parse(BUNDLED_GUIDES_JSON))
    if (!parsed.success) return { ok: false, error: 'The bundled guide content is invalid. Rebuild it with scripts/guides/build.ts.' }

    const [{ data: skills }, { data: subjects }, { data: existing }] = await Promise.all([
      db.from('skills').select('id, code, domains(subject_id)'),
      db.from('subjects').select('id, code'),
      db.from('guides').select('id, slug, guide_contents(locale)'),
    ])
    const skillByCode = new Map((skills ?? []).map((s) => {
      const d = s.domains as { subject_id: string } | { subject_id: string }[] | null
      return [s.code, { id: s.id, subjectId: (Array.isArray(d) ? d[0]?.subject_id : d?.subject_id) ?? null }] as const
    }))
    const subjectByCode = new Map((subjects ?? []).map((s) => [s.code, s.id]))
    const existingBySlug = new Map((existing ?? []).map((g) => [g.slug, { id: g.id, locales: new Set((g.guide_contents ?? []).map((c) => c.locale)) }]))

    let created = 0
    let languagesAdded = 0
    let skipped = 0
    const createdIds: string[] = []
    for (const guide of parsed.data) {
      let target = existingBySlug.get(guide.slug)
      if (!target) {
        const skill = guide.skill ? skillByCode.get(guide.skill) : undefined
        if (guide.skill && !skill) {
          skipped++
          continue
        }
        const { data, error } = await db
          .from('guides')
          .insert({
            slug: guide.slug,
            kind: guide.kind,
            skill_id: skill?.id ?? null,
            subject_id: guide.subject ? (subjectByCode.get(guide.subject) ?? null) : (skill?.subjectId ?? null),
            position: guide.position,
            reading_minutes: guide.readingMinutes,
            created_by: profile.id,
          })
          .select('id')
          .single()
        if (error || !data) {
          // e.g. another live guide already covers this skill — leave it alone.
          skipped++
          continue
        }
        target = { id: data.id, locales: new Set() }
        created++
        createdIds.push(data.id)
      }
      for (const [locale, content] of Object.entries(guide.locales)) {
        if (!content || target.locales.has(locale)) continue
        check(
          await db.from('guide_contents').insert({
            guide_id: target.id,
            locale,
            title: content.title,
            summary: content.summary,
            sections: content.sections,
          }),
          { entity: 'guide content' },
        )
        languagesAdded++
      }
    }
    if (createdIds.length) check(await db.from('guides').update({ status: 'published' }).in('id', createdIds), { entity: 'guide' })
    revalidateGuides()
    return {
      ok: true,
      data: { created, languagesAdded, skipped },
      message: `Imported ${created} guide(s) and ${languagesAdded} language version(s)${skipped ? `; ${skipped} skipped` : ''}`,
    }
  })
}
