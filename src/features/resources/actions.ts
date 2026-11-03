'use server'

import { revalidatePath } from 'next/cache'
import { CONTENT_ROLES } from '@/config/roles'
import type { ActionResult } from '@/lib/api/errors'
import { publicEnv } from '@/lib/env'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { writeAudit } from '@/lib/audit'
import { getTaxonomy } from '@/features/taxonomy/server'
import { adminAction, check } from '@/features/admin/server-utils'
import type { Database } from '@/types/database'

type ResourceUpdate = Database['public']['Tables']['learning_resources']['Update']
import { checkLink } from './link-check'
import { linkWorks, ResourceInputSchema, ResourceStatusSchema, validateResourceUrl } from './rules'

/**
 * Staff actions for the Resource Hub. Authorization: content managers only (getApiContext).
 * Writes use the service role after these checks; every change is audited with the actor.
 */

const URL_ERRORS: Record<string, string> = {
  invalid_url: 'Enter a full link starting with https://',
  https_only: 'Only https:// links are allowed.',
  ip_literal: 'Use the site’s address, not an IP address.',
  host_not_allowed: 'This link is not on the chosen provider’s website. Pick the right provider or "Other".',
}

const siteHost = () => {
  try {
    return new URL(publicEnv.NEXT_PUBLIC_SITE_URL).hostname
  } catch {
    return null
  }
}

function refresh() {
  revalidatePath('/admin/resources')
  revalidatePath('/dashboard/resources')
}

export async function saveResourceAction(input: unknown): Promise<ActionResult<{ id: string; linkStatus: number | null }>> {
  return adminAction(CONTENT_ROLES, async ({ profile }) => {
    const parsed = ResourceInputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
    const d = parsed.data
    const urlError = validateResourceUrl(d.url, d.provider, siteHost())
    if (urlError) return { ok: false, error: URL_ERRORS[urlError]!, fieldErrors: { url: [URL_ERRORS[urlError]!] } }

    const admin = createAdminSupabase()
    // Taxonomy consistency: skill ⊂ domain ⊂ subject.
    const taxonomy = await getTaxonomy(admin)
    const skill = d.skillId ? taxonomy.skillById.get(d.skillId) : undefined
    const domainId = skill?.domainId ?? d.domainId
    const domain = domainId ? taxonomy.domainById.get(domainId) : undefined
    const subjectId = domain?.subjectId ?? d.subjectId
    if ((d.skillId && !skill) || (domainId && !domain) || (subjectId && !taxonomy.subjectById.has(subjectId))) return { ok: false, error: 'Unknown subject, domain or skill.' }

    const link = await checkLink(d.url)
    const row = {
      provider: d.provider,
      provider_name: d.providerName,
      kind: d.kind,
      title: d.title,
      description: d.description,
      url: d.url,
      language: d.language,
      subject_id: subjectId ?? null,
      domain_id: domainId ?? null,
      skill_id: d.skillId,
      usage_terms: d.usageTerms,
      attribution: d.attribution,
      position: d.position,
      link_status: link.status,
      link_checked_at: new Date().toISOString(),
      updated_by: profile.id,
    }
    let id = d.id
    if (id) {
      const { data: before } = check(await admin.from('learning_resources').select('status').eq('id', id).maybeSingle(), { entity: 'resource' })
      if (!before) return { ok: false, error: 'This resource no longer exists.' }
      // A published link that stopped working goes back to draft instead of staying visible.
      const status = before.status === 'published' && !linkWorks(link.status) ? 'draft' : before.status
      check(await admin.from('learning_resources').update({ ...row, status }).eq('id', id), { entity: 'resource' })
    } else {
      const { data } = check(await admin.from('learning_resources').insert({ ...row, status: 'draft', created_by: profile.id }).select('id').single(), { entity: 'resource' })
      id = data!.id
    }
    await writeAudit({ actorId: profile.id, actorRole: profile.role, action: d.id ? 'resource.update' : 'resource.create', entityType: 'learning_resource', entityId: id, after: { url: d.url, provider: d.provider, link_status: link.status } })
    refresh()
    const message = linkWorks(link.status) ? 'Saved. The link works.' : `Saved as a draft. The link did not answer (${link.error ?? link.status}).`
    return { ok: true, data: { id: id!, linkStatus: link.status }, message }
  })
}

export async function setResourceStatusAction(input: unknown): Promise<ActionResult> {
  return adminAction(CONTENT_ROLES, async ({ profile }) => {
    const parsed = ResourceStatusSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'Invalid request.' }
    const admin = createAdminSupabase()
    const { data: current } = check(await admin.from('learning_resources').select('id, url, status').eq('id', parsed.data.id).maybeSingle(), { entity: 'resource' })
    if (!current) return { ok: false, error: 'This resource no longer exists.' }
    const patch: ResourceUpdate = { status: parsed.data.status, updated_by: profile.id }
    if (parsed.data.status === 'published') {
      // Re-check right before publishing: students only ever see links that answered just now.
      const link = await checkLink(current.url)
      patch.link_status = link.status
      patch.link_checked_at = new Date().toISOString()
      if (!linkWorks(link.status)) {
        check(await admin.from('learning_resources').update({ link_status: link.status, link_checked_at: patch.link_checked_at }).eq('id', current.id), { entity: 'resource' })
        refresh()
        return { ok: false, error: `Not published: the link did not answer (${link.error ?? link.status}).` }
      }
      patch.published_at = new Date().toISOString()
    }
    check(await admin.from('learning_resources').update(patch).eq('id', current.id), { entity: 'resource' })
    await writeAudit({ actorId: profile.id, actorRole: profile.role, action: `resource.${parsed.data.status}`, entityType: 'learning_resource', entityId: current.id, before: { status: current.status }, after: { status: parsed.data.status } })
    refresh()
    return { ok: true, message: parsed.data.status === 'published' ? 'Published' : parsed.data.status === 'archived' ? 'Archived' : 'Moved to drafts' }
  })
}
