import 'server-only'
import type { Db } from '@/lib/supabase/server'
import { DbActionError } from '@/features/admin/server-utils'

type PackRow = { stem?: string | null; passage?: string | null; skill_code?: string }

/**
 * Identity of a pack question in an environment: passage + stem, whitespace-normalized. The stem
 * alone is not enough — many Reading and Writing questions share the same stem
 * ("Which choice completes the text…") and differ only in the passage.
 */
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
export const packKey = (q: PackRow) => `${norm(q.passage)}\u0000${norm(q.stem)}`

/** Keys of the questions this environment already has with the pack tag (any status). */
export async function importedPackKeys(db: Db, packId: string): Promise<Set<string>> {
  const { data, error } = await db.from('questions').select('stem, passage').contains('tags', [packId]).limit(5000)
  if (error) throw new DbActionError(error, { entity: 'question' })
  return new Set((data ?? []).map(packKey))
}

/** The question pack bundled into this build, or null when the build has none. Contains answer keys: server only. */
export async function loadBundledPack(): Promise<{ id: string; rows: PackRow[] } | null> {
  const { QUESTION_PACK_ID, QUESTION_PACK_JSON } = await import('./question-pack.generated')
  const rows = JSON.parse(QUESTION_PACK_JSON) as PackRow[]
  return rows.length ? { id: QUESTION_PACK_ID, rows } : null
}

/** How many questions the bundled pack holds and how many this environment already has (any status). */
export async function bundledPackStatus(db: Db): Promise<{ id: string; total: number; skills: number; imported: number } | null> {
  const pack = await loadBundledPack()
  if (!pack) return null
  const have = await importedPackKeys(db, pack.id)
  return {
    id: pack.id,
    total: pack.rows.length,
    skills: new Set(pack.rows.map((r) => r.skill_code)).size,
    imported: pack.rows.filter((r) => have.has(packKey(r))).length,
  }
}
