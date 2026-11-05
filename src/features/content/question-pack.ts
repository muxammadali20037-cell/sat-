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

export type BundledPack = { id: string; rows: PackRow[] }

/** Every question pack bundled into this build (oldest first). Contains answer keys: server only. */
export async function loadBundledPacks(): Promise<BundledPack[]> {
  const { BUNDLED_PACKS } = await import('./packs/index.generated')
  return BUNDLED_PACKS.map((p) => ({ id: p.id, rows: JSON.parse(p.json) as PackRow[] })).filter((p) => p.rows.length > 0)
}

export async function loadBundledPack(id: string): Promise<BundledPack | null> {
  return (await loadBundledPacks()).find((p) => p.id === id) ?? null
}

export type PackStatus = { id: string; total: number; skills: number; imported: number }

/** For each bundled pack: how many questions it holds and how many this environment already has (any status). */
export async function bundledPacksStatus(db: Db): Promise<PackStatus[]> {
  const packs = await loadBundledPacks()
  return Promise.all(
    packs.map(async (pack) => {
      const have = await importedPackKeys(db, pack.id)
      return {
        id: pack.id,
        total: pack.rows.length,
        skills: new Set(pack.rows.map((r) => r.skill_code)).size,
        imported: pack.rows.filter((r) => have.has(packKey(r))).length,
      }
    }),
  )
}
