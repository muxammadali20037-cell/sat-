/**
 * The bundled question pack (src/features/content/question-pack.generated.ts) must be exactly the
 * content files plus the pack tag — the admin import reads the bundle, reviewers read the files.
 * Rebuild with: npx tsx scripts/question-packs/check.ts <pack> --bundle
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QUESTION_PACK_ID, QUESTION_PACK_JSON } from '@/features/content/question-pack.generated'

const dir = resolve(__dirname, '../../content/question-packs', QUESTION_PACK_ID)
const bundled = JSON.parse(QUESTION_PACK_JSON) as Array<Record<string, unknown>>

describe('bundled question pack', () => {
  it('matches the content files', () => {
    expect(existsSync(dir)).toBe(true)
    const fromFiles = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .flatMap((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Array<Record<string, unknown>>)
      .map((row) => {
        const tags = Array.isArray(row.tags) ? row.tags.map(String) : String(row.tags ?? '').split('|').filter(Boolean)
        return { ...row, tags: [...new Set([...tags.map((t) => t.trim()), QUESTION_PACK_ID])] }
      })
    expect(bundled).toEqual(fromFiles)
  })

  it('every row is an original question tagged with the pack id and has an Uzbek explanation', () => {
    for (const row of bundled) {
      expect(row.tags).toContain(QUESTION_PACK_ID)
      expect(row.source ?? 'original').toBe('original')
      expect(String(row.explanation_uz ?? '').trim()).not.toBe('')
    }
  })
})
