import 'server-only'
import { headers } from 'next/headers'
import type { Json } from '@/types/database'
import { createAdminSupabase } from '@/lib/supabase/admin'

/**
 * Application-level audit entries (actions that are not plain row changes, e.g. refunds,
 * role changes initiated in the UI, imports). Row-level changes on staff-managed tables are
 * also captured automatically by the public.audit_row_change() trigger.
 */
export async function writeAudit(entry: {
  actorId: string | null
  actorRole?: string | null
  action: string
  entityType: string
  entityId?: string | null
  summary?: string
  before?: Json
  after?: Json
}): Promise<void> {
  try {
    let ip: string | null = null
    let userAgent: string | null = null
    try {
      const h = await headers()
      ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      userAgent = h.get('user-agent')?.slice(0, 300) ?? null
    } catch {
      // Outside a request scope (scripts/tests).
    }
    const admin = createAdminSupabase()
    const { error } = await admin.from('audit_logs').insert({
      actor_id: entry.actorId,
      actor_role: entry.actorRole ?? null,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      summary: entry.summary ?? '',
      before_data: entry.before ?? null,
      after_data: entry.after ?? null,
      ip_address: ip,
      user_agent: userAgent,
    })
    if (error) throw error
  } catch (err) {
    // Auditing must never break the user-facing action, but failures are always logged.
    console.error('[audit] failed to write audit log', { action: entry.action, err })
  }
}
