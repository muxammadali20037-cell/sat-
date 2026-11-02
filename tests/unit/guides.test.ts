import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import katex from 'katex'
import { describe, expect, it } from 'vitest'
import { guideFileSchema, localeContentSchema, sectionSchema, skillGuideGaps } from '@/features/guides/schema'
import { localeOrder, parseSections, pickLocale } from '@/features/guides/locale'
import { collectMath, parseRichText } from '@/lib/rich-text/tokenize'

const DIR = resolve(__dirname, '../../content/guides')
const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))

const maths = collectMath

describe('study guide content files', () => {
  it('has content', () => expect(files.length).toBeGreaterThan(0))

  for (const file of files) {
    it(`${file} is valid, complete and renders`, () => {
      const guide = guideFileSchema.parse(JSON.parse(readFileSync(resolve(DIR, file), 'utf8')))
      expect(file).toBe(`${guide.slug}.json`)
      for (const content of Object.values(guide.locales)) {
        if (!content) continue
        if (guide.kind === 'skill') expect(skillGuideGaps(content)).toEqual([])
        const texts = content.sections.flatMap((s) => [
          s.body ?? '',
          ...(s.items ?? []),
          ...(s.steps ?? []),
          ...(s.example ? [s.example.problem, s.example.passage ?? '', ...(s.example.choices ?? []), ...s.example.solution, s.example.answer] : []),
          ...(s.terms ?? []).map((t) => t.meaning),
        ])
        for (const tex of texts.flatMap((t) => maths(parseRichText(t)))) {
          expect(() => katex.renderToString(tex, { throwOnError: true, strict: 'ignore' })).not.toThrow()
        }
      }
    })
  }

  it('has at most one guide per skill and unique slugs', () => {
    const guides = files.map((f) => guideFileSchema.parse(JSON.parse(readFileSync(resolve(DIR, f), 'utf8'))))
    const skills = guides.filter((g) => g.skill).map((g) => g.skill)
    expect(new Set(skills).size).toBe(skills.length)
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length)
  })
})

describe('guide schema rules', () => {
  it('rejects a method section without steps and an example section without an example', () => {
    expect(sectionSchema.safeParse({ type: 'method', heading: 'Usul', body: 'text' }).success).toBe(false)
    expect(sectionSchema.safeParse({ type: 'example', heading: 'Namuna', body: 'text' }).success).toBe(false)
    expect(sectionSchema.safeParse({ type: 'note', heading: 'Eslatma' }).success).toBe(false)
  })
  it('rejects unbalanced math delimiters', () => {
    expect(sectionSchema.safeParse({ type: 'concept', heading: 'Tushuncha', body: 'costs $5 today' }).success).toBe(false)
    expect(sectionSchema.safeParse({ type: 'concept', heading: 'Tushuncha', body: 'costs \\$5 today' }).success).toBe(true)
  })
  it('requires a skill code for skill guides and none for strategy guides', () => {
    const content = { title: 'Sarlavha', summary: 'Qisqa mazmun matni.', sections: [{ type: 'note', heading: 'A1', body: 'x' }, { type: 'note', heading: 'B2', body: 'y' }] }
    expect(guideFileSchema.safeParse({ slug: 'a', kind: 'skill', position: 1, readingMinutes: 5, locales: { uz: content } }).success).toBe(false)
    expect(guideFileSchema.safeParse({ slug: 'a', kind: 'strategy', skill: 'boundaries', position: 1, readingMinutes: 5, locales: { uz: content } }).success).toBe(false)
    expect(guideFileSchema.safeParse({ slug: 'a', kind: 'strategy', position: 1, readingMinutes: 5, locales: { uz: content } }).success).toBe(true)
  })
  it('lists editorial gaps for an incomplete skill guide', () => {
    const content = localeContentSchema.parse({
      title: 'Sarlavha',
      summary: 'Qisqa mazmun matni.',
      sections: [
        { type: 'concept', heading: 'Tushuncha', body: 'x' },
        { type: 'method', heading: 'Usul', steps: ['a', 'b'] },
      ],
    })
    const gaps = skillGuideGaps(content)
    expect(gaps).toContain('missing a "example" section')
    expect(gaps).toContain('method needs at least 3 steps')
    expect(gaps).toContain('missing a "watch_out" or "traps" section')
  })
})

describe('guide locale selection', () => {
  it('prefers the student language, then Uzbek, then English', () => {
    expect(localeOrder('en')).toEqual(['en', 'uz', 'ru'])
    expect(localeOrder('uz')).toEqual(['uz', 'en', 'ru'])
    expect(localeOrder('ru')).toEqual(['ru', 'uz', 'en'])
    expect(pickLocale([{ locale: 'uz' }], 'en')?.locale).toBe('uz')
    expect(pickLocale([{ locale: 'uz' }, { locale: 'en' }], 'en')?.locale).toBe('en')
    expect(pickLocale([], 'en')).toBeNull()
  })
  it('drops malformed stored sections instead of failing the page', () => {
    const parsed = parseSections([{ type: 'concept', heading: 'Tushuncha', body: 'ok' }, { type: 'bogus' }, 'x'], 'test')
    expect(parsed).toHaveLength(1)
    expect(parseSections(null, 'test')).toEqual([])
  })
})

describe('bundled guide content', () => {
  it('matches content/guides (run scripts/guides/build.ts after editing content)', async () => {
    const { BUNDLED_GUIDES_JSON } = await import('@/features/guides/bundled.generated')
    const bundled = (JSON.parse(BUNDLED_GUIDES_JSON) as unknown[]).map((g) => guideFileSchema.parse(g))
    const fromFiles = files.map((f) => guideFileSchema.parse(JSON.parse(readFileSync(resolve(DIR, f), 'utf8'))))
    const key = (g: { slug: string }) => g.slug
    expect(bundled.map(key).sort()).toEqual(fromFiles.map(key).sort())
    for (const g of fromFiles) expect(bundled.find((b) => b.slug === g.slug)).toEqual(g)
  })
})
