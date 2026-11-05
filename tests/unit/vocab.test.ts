import { describe, expect, it } from 'vitest'
import { baseForms, dictionarySize, lookup, normalizeWord, WORD_RE } from '@/features/vocab/dictionary'
import raw from '../../content/vocabulary/sat-words.json'

describe('SAT MASTER vocabulary dictionary', () => {
  it('is valid, sizeable and every entry has uz, ru, a definition and an example', () => {
    expect(dictionarySize()).toBeGreaterThanOrEqual(200)
    for (const [w, e] of Object.entries(raw.words as Record<string, { uz: string; ru: string; def: string; ex: string }>)) {
      expect(WORD_RE.test(w), w).toBe(true)
      expect(e.uz && e.ru && e.def && e.ex, w).toBeTruthy()
    }
  })
  it('normalizes a selection to one lowercase word', () => {
    expect(normalizeWord('  Mitigate, ')).toBe('mitigate')
    expect(normalizeWord('“Resilient”')).toBe('resilient')
    expect(normalizeWord("author's")).toBe('author')
    expect(normalizeWord('well-known')).toBe('well-known')
    for (const bad of ['two words', '123', '', 'x'.repeat(41), 'a<b>c', 'semi;colon']) expect(normalizeWord(bad)).toBeNull()
  })
  it('finds base forms of inflected words', () => {
    expect(lookup('mitigated')?.key).toBe('mitigate')
    expect(lookup('mitigating')?.key).toBe('mitigate')
    expect(lookup('fluctuates')?.key).toBe('fluctuate')
    expect(lookup('implies')?.key).toBe('imply')
    expect(lookup('considerably')?.key).toBe('considerable')
    expect(lookup('hypotheses')).toBeNull()
    expect(lookup('fragments')?.key).toBe('fragment')
    expect(lookup('diminished')?.key).toBe('diminish')
    expect(baseForms('running')).toContain('run')
  })
  it('returns uz/ru translations for a known word, nothing for an unknown one', () => {
    const hit = lookup('resilient')!
    expect(hit.entry.uz).toMatch(/chidamli/)
    expect(hit.entry.ru).toMatch(/устойчив/)
    expect(lookup('zzzz')).toBeNull()
  })
})
