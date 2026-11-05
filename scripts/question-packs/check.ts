/**
 * Question packs: original practice questions shipped with the app (content/question-packs/<pack>/<skill_code>.json).
 * Each file is a JSON array of rows in the admin import format (see src/features/content/question-import.ts).
 *
 *   npx tsx scripts/question-packs/check.ts core-v1                  # validate the whole pack
 *   npx tsx scripts/question-packs/check.ts core-v1 FILE...          # validate specific files (pack-wide checks still run)
 *   npx tsx scripts/question-packs/check.ts core-v1 --blind OUT.json # questions without keys, for an independent solver
 *   npx tsx scripts/question-packs/check.ts core-v1 --compare ANSWERS.json  # compare a solver's answers with the keys
 *   npx tsx scripts/question-packs/check.ts core-v1 --bundle         # validate, then write the bundled module for admin import
 *
 * Checks: the import validator (same code as the admin import), file name = skill code, per-skill
 * count and difficulty mix, SPR only in Math, original source, KaTeX rendering, and duplicate stems
 * within the pack and against the dev seed.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import katex from 'katex'
import { buildImportReport, type ImportTaxonomy } from '../../src/features/content/question-import'
import { collectMath, parseRichText } from '../../src/lib/rich-text/tokenize'
import { isSprCorrect } from '../../src/lib/scoring'

const ROOT = resolve(__dirname, '../..')
const REFERENCE = resolve(ROOT, 'supabase/migrations/20261102001000_reference_data.sql')
const SEED = resolve(ROOT, 'supabase/seed/dev_seed.sql')

const args = process.argv.slice(2)
const pack = args[0]
if (!pack || pack.startsWith('--')) {
  console.error('usage: check.ts <pack> [files…] [--blind OUT] [--compare ANSWERS] [--bundle]')
  process.exit(2)
}
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? (args[i + 1] ?? '') : null
}
const blindOut = flag('--blind')
const compareIn = flag('--compare')
const bundle = args.includes('--bundle')
const PER_SKILL = Number(flag('--per-skill') ?? 8)
const DIR = resolve(ROOT, 'content/question-packs', pack)
const explicit = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !['--blind', '--compare', '--per-skill'].includes(arr[i - 1] ?? ''))

function taxonomy(): ImportTaxonomy & { subjectOfSkill: Map<string, string> } {
  // The import schema requires UUIDs, so every taxonomy row gets a stable synthetic one.
  let n = 0
  const uuid = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`
  const sql = readFileSync(REFERENCE, 'utf8')
  const subjects = [
    { id: uuid(), code: 'math', name: 'Math' },
    { id: uuid(), code: 'reading_writing', name: 'Reading and Writing' },
  ]
  const subjectId = (code: string) => subjects.find((s) => s.code === code)!.id
  const domains = [...sql.matchAll(/\('(math|reading_writing)','([a-z_]+)','([^']+)','[^']*',\d+,\d+\)/g)].map((m) => ({
    id: uuid(),
    subjectId: subjectId(m[1]!),
    code: m[2]!,
    name: m[3]!,
  }))
  const skills = [...sql.matchAll(/\('([a-z_]+)','([a-z0-9_]+)','([^']+)','[^']*',\d+\)/g)].map((m) => ({
    id: uuid(),
    domainId: domains.find((d) => d.code === m[1])!.id,
    code: m[2]!,
    name: m[3]!,
  }))
  const subjectOfSkill = new Map(
    skills.map((s) => {
      const d = domains.find((x) => x.id === s.domainId)!
      return [s.code, subjects.find((x) => x.id === d.subjectId)!.code] as const
    }),
  )
  return { subjects, domains, skills, subjectOfSkill }
}

const maths = (text: string): string[] => collectMath(parseRichText(text))

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim()
type Row = Record<string, unknown> & { skill_code?: string; difficulty?: string; question_type?: string; stem?: string; correct?: string; spr_answers?: unknown }

function main() {
  const tax = taxonomy()
  if (!existsSync(DIR)) {
    console.error(`no pack directory ${DIR}`)
    process.exit(2)
  }
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()
  const selected = explicit.length ? explicit.map((f) => basename(f)) : files
  const seedStems = new Set(
    existsSync(SEED) ? [...readFileSync(SEED, 'utf8').matchAll(/stem[^']*'((?:[^']|'')+)'/g)].map((m) => norm(m[1]!.replace(/''/g, "'"))) : [],
  )
  const stems = new Map<string, string>()
  // Questions of the other packs: a new pack must not repeat one (same passage + stem, or same passage).
  const PACKS_ROOT = resolve(ROOT, 'content/question-packs')
  const otherKeys = new Map<string, string>()
  const otherPassages = new Map<string, string>()
  for (const other of readdirSync(PACKS_ROOT).filter((p) => p !== pack && existsSync(resolve(PACKS_ROOT, p)))) {
    const odir = resolve(PACKS_ROOT, other)
    for (const f of readdirSync(odir).filter((x) => x.endsWith('.json'))) {
      ;(JSON.parse(readFileSync(resolve(odir, f), 'utf8')) as Row[]).forEach((r, i) => {
        otherKeys.set(norm(`${r.passage ?? ''} ${r.stem ?? ''}`), `${other}/${f} row ${i + 1}`)
        if (r.passage && String(r.passage).length > 60) otherPassages.set(norm(String(r.passage)), `${other}/${f} row ${i + 1}`)
      })
    }
  }
  let failed = false
  const all: Array<{ file: string; index: number; row: Row }> = []

  for (const file of files) {
    const skill = basename(file, '.json')
    const errors: string[] = []
    let rows: Row[] = []
    try {
      rows = JSON.parse(readFileSync(resolve(DIR, file), 'utf8'))
      if (!Array.isArray(rows)) throw new Error('top level must be an array of rows')
    } catch (e) {
      errors.push(`invalid JSON: ${(e as Error).message}`)
    }
    if (!tax.skills.some((s) => s.code === skill)) errors.push(`file name must be a skill code (got "${skill}")`)
    const report = buildImportReport(JSON.stringify(rows), tax, 'json')
    for (const e of report.fileErrors) errors.push(e)
    for (const r of report.rows) if (!r.ok) errors.push(`row ${r.row}: ${r.errors.join('; ')}`)

    const isMath = tax.subjectOfSkill.get(skill) === 'math'
    const diff = { easy: 0, medium: 0, hard: 0 } as Record<string, number>
    let spr = 0
    rows.forEach((row, i) => {
      all.push({ file, index: i, row })
      if (row.skill_code !== skill) errors.push(`row ${i + 1}: skill_code must be "${skill}"`)
      if (row.difficulty) diff[String(row.difficulty)] = (diff[String(row.difficulty)] ?? 0) + 1
      const type = String(row.question_type ?? '')
      if (type === 'spr' || type === 'student_produced_response') {
        spr++
        if (!isMath) errors.push(`row ${i + 1}: student-produced responses are Math only`)
        const answers = Array.isArray(row.spr_answers) ? row.spr_answers.map(String) : String(row.spr_answers ?? '').split('|')
        for (const a of answers) if (!isSprCorrect(a, answers)) errors.push(`row ${i + 1}: SPR answer "${a}" does not score as correct against its own key`)
      }
      if ((row.source ?? 'original') !== 'original') errors.push(`row ${i + 1}: source must be "original"`)
      if (!String(row.explanation_uz ?? '').trim()) errors.push(`row ${i + 1}: explanation_uz is required in this pack`)
      for (const key of ['stem', 'passage', 'option_a', 'option_b', 'option_c', 'option_d', 'explanation_en', 'explanation_uz']) {
        const text = row[key]
        if (typeof text !== 'string' || !text) continue
        for (const tex of maths(text)) {
          try {
            katex.renderToString(tex, { throwOnError: true, strict: 'ignore' })
          } catch (e) {
            errors.push(`row ${i + 1} ${key}: KaTeX cannot render "${tex.slice(0, 50)}": ${(e as Error).message.split('\n')[0]}`)
          }
        }
      }
      const key = norm(`${row.passage ?? ''} ${row.stem ?? ''}`)
      if (key && stems.has(key)) errors.push(`row ${i + 1}: duplicate of ${stems.get(key)}`)
      else if (key) stems.set(key, `${file} row ${i + 1}`)
      if (row.stem && seedStems.has(norm(String(row.stem)))) errors.push(`row ${i + 1}: same stem as a dev-seed question`)
      if (key && otherKeys.has(key)) errors.push(`row ${i + 1}: same question as ${otherKeys.get(key)}`)
      else if (row.passage && otherPassages.has(norm(String(row.passage)))) errors.push(`row ${i + 1}: same passage as ${otherPassages.get(norm(String(row.passage)))}`)
    })
    if (rows.length !== PER_SKILL) errors.push(`expected ${PER_SKILL} questions, found ${rows.length}`)
    if (rows.length === PER_SKILL && PER_SKILL === 8 && (diff.easy !== 3 || diff.medium !== 3 || diff.hard !== 2))
      errors.push(`difficulty mix must be 3 easy / 3 medium / 2 hard (got ${diff.easy ?? 0}/${diff.medium ?? 0}/${diff.hard ?? 0})`)
    if (isMath && rows.length > 0 && spr < 2) errors.push(`Math skills need at least 2 student-produced-response questions (found ${spr})`)

    if (!selected.includes(file)) continue
    if (errors.length) {
      failed = true
      console.error(`✗ ${file}`)
      for (const e of errors) console.error(`    ${e}`)
    } else console.log(`✓ ${file} (${rows.length})`)
  }

  const missing = tax.skills.map((s) => s.code).filter((c) => !files.includes(`${c}.json`))
  console.log(`\n${all.length} question(s) in ${files.length} file(s); skills without a file: ${missing.length ? missing.join(', ') : 'none'}`)

  if (blindOut) {
    const blind = all.map(({ file, index, row }) => ({
      id: `${basename(file, '.json')}#${index + 1}`,
      question_type: row.question_type,
      passage: row.passage ?? undefined,
      stem: row.stem,
      options: row.question_type === 'mc' || row.question_type === 'multiple_choice' ? { A: row.option_a, B: row.option_b, C: row.option_c, D: row.option_d } : undefined,
    }))
    writeFileSync(resolve(blindOut), JSON.stringify(blind, null, 2))
    console.log(`wrote ${blind.length} blind question(s) to ${blindOut}`)
  }

  if (compareIn) {
    const answers = JSON.parse(readFileSync(resolve(compareIn), 'utf8')) as Record<string, string>
    const mismatches: string[] = []
    for (const { file, index, row } of all) {
      const id = `${basename(file, '.json')}#${index + 1}`
      const given = answers[id]
      if (given === undefined) {
        mismatches.push(`${id}: no answer from the solver`)
        continue
      }
      const type = String(row.question_type)
      if (type === 'mc' || type === 'multiple_choice') {
        if (String(given).trim().toUpperCase() !== String(row.correct).trim().toUpperCase()) mismatches.push(`${id}: key ${row.correct}, solver ${given}`)
      } else {
        const keys = Array.isArray(row.spr_answers) ? row.spr_answers.map(String) : String(row.spr_answers ?? '').split('|')
        if (!isSprCorrect(String(given), keys)) mismatches.push(`${id}: keys ${keys.join(' | ')}, solver ${given}`)
      }
    }
    console.log(mismatches.length ? `\n${mismatches.length} mismatch(es):\n  ${mismatches.join('\n  ')}` : '\nAll answers match the keys.')
    if (mismatches.length) failed = true
  }

  if (failed) process.exit(1)

  if (bundle) {
    // One generated module per pack, plus an index of every bundled pack (rewritten each time).
    const dir = resolve(ROOT, 'src/features/content/packs')
    const out = resolve(dir, `${pack}.generated.ts`)
    // Every bundled row carries the pack id as a tag, so the admin import can tell what is already there.
    const rows = all.map(({ row }) => {
      const tags = Array.isArray(row.tags) ? row.tags.map(String) : String(row.tags ?? '').split('|').filter(Boolean)
      return { ...row, tags: [...new Set([...tags.map((t) => t.trim()), pack])] }
    })
    writeFileSync(
      out,
      [
        `// GENERATED by scripts/question-packs/check.ts ${pack} --bundle — do not edit by hand.`,
        '// Server-only: contains answer keys. Imported by the admin "import bundled pack" action.',
        `export const PACK = { id: ${JSON.stringify(pack)}, json: ${JSON.stringify(JSON.stringify(rows))} }`,
        '',
      ].join('\n'),
    )
    const packs = readdirSync(dir)
      .filter((f) => f.endsWith('.generated.ts') && f !== 'index.generated.ts')
      .map((f) => f.replace(/\.generated\.ts$/, ''))
      .sort()
    writeFileSync(
      resolve(dir, 'index.generated.ts'),
      [
        '// GENERATED by scripts/question-packs/check.ts --bundle — do not edit by hand. Server-only.',
        ...packs.map((p, i) => `import { PACK as p${i} } from './${p}.generated'`),
        '',
        `export const BUNDLED_PACKS: Array<{ id: string; json: string }> = [${packs.map((_, i) => `p${i}`).join(', ')}]`,
        '',
      ].join('\n'),
    )
    console.log(`wrote ${out.replace(ROOT + '/', '')} (${rows.length} rows); bundled packs: ${packs.join(', ')}`)
  }
}

main()
