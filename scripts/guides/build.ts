/**
 * Study-guide content pipeline.
 *
 *   npx tsx scripts/guides/build.ts --check            # validate every content/guides/*.json
 *   npx tsx scripts/guides/build.ts --check FILE...    # validate specific files
 *   npx tsx scripts/guides/build.ts                    # validate all, then write the data migration
 *
 * Validation: JSON schema (src/features/guides/schema.ts), editorial completeness for skill guides,
 * known skill codes (from the reference-data migration), unique slugs / one guide per skill, and
 * every math segment rendered with KaTeX (throwOnError) so nothing breaks on screen.
 *
 * The migration inserts guides and their content only when absent (`on conflict do nothing`), so
 * edits made later in the admin panel are never overwritten by re-running migrations.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import katex from 'katex'
import { guideFileSchema, skillGuideGaps, type GuideFile } from '../../src/features/guides/schema'
import { parseRichText, type BlockNode, type InlineNode } from '../../src/lib/rich-text/tokenize'

const ROOT = resolve(__dirname, '../..')
const CONTENT_DIR = resolve(ROOT, 'content/guides')
const REFERENCE_MIGRATION = resolve(ROOT, 'supabase/migrations/20261102001000_reference_data.sql')
const OUTPUT = resolve(ROOT, 'supabase/migrations/20261102001400_guides_content.sql')
const BUNDLE = resolve(ROOT, 'src/features/guides/bundled.generated.ts')

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const explicitFiles = args.filter((a) => !a.startsWith('--'))

function knownSkillCodes(): Set<string> {
  const sql = readFileSync(REFERENCE_MIGRATION, 'utf8')
  const codes = new Set<string>()
  for (const m of sql.matchAll(/\('(?:[a-z_]+)','([a-z0-9_]+)','[^']*','[^']*',\d+\)/g)) codes.add(m[1]!)
  return codes
}

function collectMath(blocks: BlockNode[]): string[] {
  const out: string[] = []
  const walk = (nodes: InlineNode[]) => {
    for (const n of nodes) {
      if (n.type === 'math') out.push(n.value)
      else if (n.type === 'bold' || n.type === 'italic' || n.type === 'underline') walk(n.children)
    }
  }
  for (const b of blocks) {
    if (b.type === 'display_math') out.push(b.value)
    else if (b.type === 'paragraph') walk(b.children)
    else for (const item of b.items) walk(item)
  }
  return out
}

function richTextStrings(guide: GuideFile): string[] {
  const out: string[] = []
  for (const content of Object.values(guide.locales)) {
    if (!content) continue
    out.push(content.summary)
    for (const s of content.sections) {
      if (s.body) out.push(s.body)
      out.push(...(s.items ?? []), ...(s.steps ?? []))
      if (s.example) out.push(s.example.problem, ...(s.example.passage ? [s.example.passage] : []), ...(s.example.choices ?? []), ...s.example.solution, s.example.answer)
      for (const t of s.terms ?? []) out.push(t.meaning)
    }
  }
  return out
}

type Loaded = { file: string; guide?: GuideFile; errors: string[] }

function load(file: string, skills: Set<string>): Loaded {
  const errors: string[] = []
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    return { file, errors: [`invalid JSON: ${(e as Error).message}`] }
  }
  const parsed = guideFileSchema.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`)
    return { file, errors }
  }
  const guide = parsed.data
  if (basename(file, '.json') !== guide.slug) errors.push(`file name must be "${guide.slug}.json"`)
  if (guide.skill && !skills.has(guide.skill)) errors.push(`unknown skill code "${guide.skill}"`)
  if (guide.kind === 'skill') {
    for (const [locale, content] of Object.entries(guide.locales)) {
      if (content) for (const gap of skillGuideGaps(content)) errors.push(`${locale}: ${gap}`)
    }
  }
  for (const text of richTextStrings(guide)) {
    for (const tex of collectMath(parseRichText(text))) {
      try {
        katex.renderToString(tex, { throwOnError: true, trust: false, strict: 'ignore' })
      } catch (e) {
        errors.push(`KaTeX cannot render "${tex.slice(0, 60)}": ${(e as Error).message.split('\n')[0]}`)
      }
    }
  }
  return { file, guide, errors }
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

function toSql(guides: GuideFile[]): string {
  const lines: string[] = [
    '-- SAT MASTER · 0014 · Study guide content (GENERATED — do not edit by hand)',
    '-- Source: content/guides/*.json → npx tsx scripts/guides/build.ts',
    '-- Inserts only missing guides/locales, so admin edits are never overwritten.',
    '',
  ]
  for (const g of [...guides].sort((a, b) => a.slug.localeCompare(b.slug))) {
    lines.push(`-- ${g.slug}`)
    lines.push(
      `insert into public.guides (slug, kind, skill_id, subject_id, position, reading_minutes, status)`,
      `select ${q(g.slug)}, ${q(g.kind)}, ${g.skill ? `(select id from public.skills where code = ${q(g.skill)})` : 'null'}, ` +
        `${g.subject ? `(select id from public.subjects where code = ${q(g.subject)})` : g.skill ? `(select d.subject_id from public.skills s join public.domains d on d.id = s.domain_id where s.code = ${q(g.skill)})` : 'null'}, ` +
        `${g.position}, ${g.readingMinutes}, 'draft'`,
      `on conflict (slug) do nothing;`,
    )
    for (const [locale, content] of Object.entries(g.locales)) {
      if (!content) continue
      lines.push(
        `insert into public.guide_contents (guide_id, locale, title, summary, sections)`,
        `select g.id, ${q(locale)}, ${q(content.title)}, ${q(content.summary)}, ${q(JSON.stringify(content.sections))}::jsonb`,
        `from public.guides g where g.slug = ${q(g.slug)}`,
        `on conflict (guide_id, locale) do nothing;`,
      )
    }
    lines.push('')
  }
  lines.push(
    '-- Publish newly inserted guides (the publish guard requires content).',
    `update public.guides set status = 'published' where status = 'draft' and slug in (${guides.map((g) => q(g.slug)).join(', ')});`,
    '',
  )
  return lines.join('\n')
}

function main() {
  const skills = knownSkillCodes()
  const all = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).map((f) => resolve(CONTENT_DIR, f))
  const files = explicitFiles.length ? explicitFiles.map((f) => resolve(f)) : all
  const loaded = files.map((f) => load(f, skills))

  // Cross-file checks run against the whole content set.
  const everything = explicitFiles.length ? all.map((f) => load(f, skills)) : loaded
  const slugs = new Map<string, string>()
  const perSkill = new Map<string, string>()
  const crossErrors: string[] = []
  for (const l of everything) {
    if (!l.guide) continue
    const prev = slugs.get(l.guide.slug)
    if (prev) crossErrors.push(`duplicate slug "${l.guide.slug}" in ${basename(prev)} and ${basename(l.file)}`)
    slugs.set(l.guide.slug, l.file)
    if (l.guide.skill) {
      const p = perSkill.get(l.guide.skill)
      if (p) crossErrors.push(`skill "${l.guide.skill}" has two guides: ${basename(p)} and ${basename(l.file)}`)
      perSkill.set(l.guide.skill, l.file)
    }
  }

  let failed = crossErrors.length > 0
  for (const l of loaded) {
    if (l.errors.length) {
      failed = true
      console.error(`✗ ${basename(l.file)}`)
      for (const e of l.errors) console.error(`    ${e}`)
    } else {
      console.log(`✓ ${basename(l.file)}`)
    }
  }
  for (const e of crossErrors) console.error(`✗ ${e}`)

  const missingSkills = [...skills].filter((s) => !perSkill.has(s))
  console.log(`\n${everything.filter((l) => l.guide).length} guide file(s); skills without a guide: ${missingSkills.length ? missingSkills.join(', ') : 'none'}`)

  if (failed) process.exit(1)
  if (!checkOnly) {
    const guides = everything.map((l) => l.guide!).sort((a, b) => a.slug.localeCompare(b.slug))
    writeFileSync(OUTPUT, toSql(guides))
    console.log(`wrote ${OUTPUT.replace(ROOT + '/', '')}`)
    // Same content bundled with the app, for Admin → Study guides → "Import bundled guides"
    // (loads content into any environment without running SQL by hand).
    writeFileSync(
      BUNDLE,
      [
        '// GENERATED by scripts/guides/build.ts from content/guides/*.json — do not edit by hand.',
        '// Parsed and validated at runtime by the admin import action.',
        `export const BUNDLED_GUIDES_JSON = ${JSON.stringify(JSON.stringify(guides))}`,
        '',
      ].join('\n'),
    )
    console.log(`wrote ${BUNDLE.replace(ROOT + '/', '')}`)
  }
}

main()
