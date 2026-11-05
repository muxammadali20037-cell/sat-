/**
 * Each bundled question pack (src/features/content/packs/<pack>.generated.ts) must be exactly its
 * content files plus the pack tag — the admin import reads the bundle, reviewers read the files.
 * Rebuild with: npx tsx scripts/question-packs/check.ts <pack> --bundle
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUNDLED_PACKS } from '@/features/content/packs/index.generated'

describe('bundled question packs', () => {
  it('there is at least the starter pack, and pack ids are unique', () => {
    expect(BUNDLED_PACKS.map((p) => p.id)).toContain('core-v1')
    expect(new Set(BUNDLED_PACKS.map((p) => p.id)).size).toBe(BUNDLED_PACKS.length)
  })

  for (const pack of BUNDLED_PACKS) {
    const dir = resolve(__dirname, '../../content/question-packs', pack.id)
    const bundled = JSON.parse(pack.json) as Array<Record<string, unknown>>

    it(`${pack.id}: matches the content files`, () => {
      expect(existsSync(dir)).toBe(true)
      const fromFiles = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .flatMap((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Array<Record<string, unknown>>)
        .map((row) => {
          const tags = Array.isArray(row.tags) ? row.tags.map(String) : String(row.tags ?? '').split('|').filter(Boolean)
          return { ...row, tags: [...new Set([...tags.map((t) => t.trim()), pack.id])] }
        })
      expect(bundled).toEqual(fromFiles)
    })

    it(`${pack.id}: every row is original, tagged with the pack id and has an Uzbek explanation`, () => {
      for (const row of bundled) {
        expect(row.tags).toContain(pack.id)
        expect(row.source ?? 'original').toBe('original')
        expect(String(row.explanation_uz ?? '').trim()).not.toBe('')
      }
    })
  }
})
