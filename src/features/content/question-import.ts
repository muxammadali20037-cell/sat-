import Papa from 'papaparse'
import { issuesToFieldErrors } from './form-errors'
import { buildQuestionPayload, QuestionInputSchema, type QuestionInputRaw, type QuestionRpcPayload } from './question-schema'
import { OPTION_LABELS, QUESTION_SOURCES, type DifficultyValue, type QuestionTypeValue } from './constants'

/**
 * Bulk question import: parse CSV/JSON text and validate every row against the same schema as
 * the editor. PURE — no I/O, no server deps — so the browser can show an instant dry run and the
 * server action re-runs exactly the same logic before writing anything (never trust the browser).
 *
 * Rows are mapped by `skill_code` → domain → subject using the taxonomy. Imported questions are
 * always drafts: they must be reviewed before they can be published.
 */

export const IMPORT_MAX_ROWS = 500
/** Server actions accept 1 MB bodies by default; keep headroom for the multipart envelope. */
export const IMPORT_MAX_CHARS = 900_000
/** Separator for multi-value cells (spr_answers, tags) in CSV. JSON may use arrays instead. */
export const MULTI_VALUE_SEPARATOR = '|'

export const IMPORT_COLUMNS = [
  'skill_code',
  'difficulty',
  'question_type',
  'stimulus_type',
  'stem',
  'passage',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct',
  'spr_answers',
  'explanation_en',
  'explanation_uz',
  'estimated_seconds',
  'tags',
  'source',
  'source_reference',
  'subject_code',
  'domain_code',
] as const
export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

export const REQUIRED_COLUMNS: readonly ImportColumn[] = ['skill_code', 'difficulty', 'question_type', 'stem', 'explanation_en']

export const IMPORT_COLUMN_HELP: Record<ImportColumn, string> = {
  skill_code: 'Required. Skill code from /admin/skills, e.g. linear_functions. Sets the domain and subject.',
  difficulty: 'Required. easy, medium or hard.',
  question_type: 'Required. mc (multiple choice) or spr (student-produced response).',
  stimulus_type: 'Optional. text or passage (default: passage when a passage is given). Image questions are created in the editor.',
  stem: 'Required. The question. Supports $math$, **bold**, *italic*, __underline__.',
  passage: 'Optional. Passage text; required when stimulus_type is passage.',
  option_a: 'Multiple choice: text of option A (all four options are required).',
  option_b: 'Multiple choice: text of option B.',
  option_c: 'Multiple choice: text of option C.',
  option_d: 'Multiple choice: text of option D.',
  correct: 'Multiple choice: the single correct letter (A, B, C or D).',
  spr_answers: `SPR: accepted answers separated by "${MULTI_VALUE_SEPARATOR}", e.g. 3/4${MULTI_VALUE_SEPARATOR}.75${MULTI_VALUE_SEPARATOR}0.75.`,
  explanation_en: 'Required. English explanation shown after answering.',
  explanation_uz: 'Optional. Uzbek explanation (Latin script).',
  estimated_seconds: 'Optional. 10–900 (default 75).',
  tags: `Optional. Tags separated by "${MULTI_VALUE_SEPARATOR}".`,
  source: 'Optional. original, licensed or ai_generated (default original).',
  source_reference: 'Optional. Where a licensed question comes from.',
  subject_code: 'Optional check: math or reading_writing. Must match the skill.',
  domain_code: 'Optional check: the domain code. Must match the skill.',
}

/** Structural taxonomy (compatible with getTaxonomy()). */
export type ImportTaxonomy = {
  subjects: ReadonlyArray<{ id: string; code: string; name: string }>
  domains: ReadonlyArray<{ id: string; subjectId: string; code: string; name: string }>
  skills: ReadonlyArray<{ id: string; domainId: string; code: string; name: string }>
}

export type ImportFormat = 'csv' | 'json'

export type ParsedImport = {
  format: ImportFormat
  records: Array<Record<string, unknown>>
  /** Problems that make the whole file unusable (bad JSON, missing columns, too many rows). */
  fileErrors: string[]
  /** Non-blocking notes (unknown columns ignored, …). */
  warnings: string[]
}

export type ImportRowPreview = {
  skillCode: string
  skillName: string | null
  subjectName: string | null
  difficulty: string
  questionType: string
  stem: string
}

export type ImportRowResult =
  | { row: number; ok: true; payload: QuestionRpcPayload; preview: ImportRowPreview; warnings: string[] }
  | { row: number; ok: false; errors: string[]; preview: ImportRowPreview; warnings: string[] }

export type ImportReport = {
  format: ImportFormat
  fileErrors: string[]
  warnings: string[]
  rows: ImportRowResult[]
  validCount: number
  invalidCount: number
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** "Option A " / "OPTION-A" / "﻿skill code" → "option_a" */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function detectFormat(text: string): ImportFormat {
  const t = text.replace(/^﻿/, '').trimStart()
  return t.startsWith('[') || t.startsWith('{') ? 'json' : 'csv'
}

function checkColumns(columns: string[], fileErrors: string[], warnings: string[]) {
  const known = new Set<string>(IMPORT_COLUMNS)
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c))
  if (missing.length > 0) fileErrors.push(`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`)
  const unknown = [...new Set(columns.filter((c) => c && !known.has(c) && c !== 'options'))]
  if (unknown.length > 0) warnings.push(`Ignored unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`)
}

export function parseCsv(text: string): ParsedImport {
  const fileErrors: string[] = []
  const warnings: string[] = []
  const source = text.replace(/^\uFEFF/, '')

  // Inspect the raw header first: papaparse silently renames duplicate headers.
  const head = Papa.parse<string[]>(source, { preview: 1, skipEmptyLines: 'greedy' })
  const rawColumns = (head.data[0] ?? []).map((h) => normalizeHeader(String(h)))
  if (rawColumns.filter(Boolean).length === 0) {
    return { format: 'csv', records: [], fileErrors: ['The file is empty or has no header row.'], warnings }
  }
  const dupes = [...new Set(rawColumns.filter((c, i) => c && rawColumns.indexOf(c) !== i))]
  if (dupes.length > 0) {
    return { format: 'csv', records: [], fileErrors: [`Duplicate column${dupes.length > 1 ? 's' : ''}: ${dupes.join(', ')}.`], warnings }
  }
  checkColumns(rawColumns.filter(Boolean), fileErrors, warnings)

  const result = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => normalizeHeader(h),
  })

  // Row-level structural problems (unterminated quotes, wrong field counts) are reported per row.
  const rowProblems = new Map<number, string[]>()
  for (const e of result.errors) {
    if (e.row === undefined || e.row === null) {
      fileErrors.push(`CSV could not be read: ${e.message}.`)
      continue
    }
    const list = rowProblems.get(e.row) ?? []
    if (e.code === 'TooFewFields') list.push('This row has fewer columns than the header (check for a missing comma or quote).')
    else if (e.code === 'TooManyFields') list.push('This row has more columns than the header (quote values that contain commas).')
    else if (e.code === 'MissingQuotes' || e.code === 'InvalidQuotes') list.push('Unbalanced quotes in this row.')
    else list.push(e.message)
    rowProblems.set(e.row, list)
  }

  const records = result.data.map((r, i) => {
    const record: Record<string, unknown> = { ...r }
    delete record['__parsed_extra']
    const problems = rowProblems.get(i)
    if (problems) record.__row_errors = problems
    return record
  })
  return { format: 'csv', records, fileErrors, warnings }
}

export function parseJson(text: string): ParsedImport {
  const warnings: string[] = []
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch (err) {
    const detail = err instanceof Error ? err.message.replace(/^JSON\.parse: /, '') : 'invalid JSON'
    return { format: 'json', records: [], fileErrors: [`The JSON could not be read: ${detail}.`], warnings }
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as { questions?: unknown }).questions)) {
    data = (data as { questions: unknown[] }).questions
  }
  if (!Array.isArray(data)) {
    return { format: 'json', records: [], fileErrors: ['JSON must be an array of question objects (or { "questions": [...] }).'], warnings }
  }
  const records: Array<Record<string, unknown>> = []
  const columns = new Set<string>()
  data.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      records.push({ __row_errors: ['Each item must be a JSON object.'] })
      return
    }
    const record: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      const key = normalizeHeader(k)
      columns.add(key)
      record[key] = v
    }
    records.push(record)
  })
  const fileErrors: string[] = []
  if (records.length > 0) {
    // In JSON the required keys are checked per row (objects may differ); only warn about unknown keys.
    checkColumns([...columns, ...REQUIRED_COLUMNS], fileErrors, warnings)
  }
  return { format: 'json', records, fileErrors, warnings }
}

export function parseImportText(text: string, format: ImportFormat | 'auto' = 'auto'): ParsedImport {
  const fmt = format === 'auto' ? detectFormat(text) : format
  if (!text.trim()) return { format: fmt, records: [], fileErrors: ['Paste CSV or JSON, or choose a file.'], warnings: [] }
  if (text.length > IMPORT_MAX_CHARS) {
    return {
      format: fmt,
      records: [],
      fileErrors: [`The file is too large (${Math.round(text.length / 1000)} KB). Split it into files under ${IMPORT_MAX_CHARS / 1000} KB.`],
      warnings: [],
    }
  }
  const parsed = fmt === 'json' ? parseJson(text) : parseCsv(text)
  if (parsed.records.length === 0 && parsed.fileErrors.length === 0) parsed.fileErrors.push('No question rows found.')
  if (parsed.records.length > IMPORT_MAX_ROWS) {
    parsed.fileErrors.push(`Too many rows (${parsed.records.length}). Import at most ${IMPORT_MAX_ROWS} questions at a time.`)
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

function cell(record: Record<string, unknown>, key: string): string {
  const v = record[key]
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.replace(/\r\n?/g, '\n').trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function list(record: Record<string, unknown>, key: string): string[] {
  const v = record[key]
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? String(x) : typeof x === 'string' ? x.trim() : '')).filter(Boolean)
  return cell(record, key)
    .split(MULTI_VALUE_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean)
}

const TYPE_ALIASES: Record<string, QuestionTypeValue> = {
  mc: 'multiple_choice',
  multiple_choice: 'multiple_choice',
  multiplechoice: 'multiple_choice',
  spr: 'student_produced_response',
  student_produced_response: 'student_produced_response',
  grid_in: 'student_produced_response',
}

/** Schema path → the column the author sees in their file. */
function columnForPath(path: string): string {
  if (path.startsWith('options.')) {
    const idx = Number(path.split('.')[1])
    return OPTION_LABELS[idx] ? `option_${OPTION_LABELS[idx]!.toLowerCase()}` : 'options'
  }
  if (path.startsWith('spr_answers')) return 'spr_answers'
  if (path.startsWith('tags')) return 'tags'
  if (path === 'correct_option') return 'correct'
  if (path === 'skill_id' || path === 'domain_id' || path === 'subject_id') return 'skill_code'
  return path
}

function preview(record: Record<string, unknown>, taxonomy: ImportTaxonomy): ImportRowPreview {
  const skillCode = cell(record, 'skill_code').toLowerCase()
  const skill = taxonomy.skills.find((s) => s.code === skillCode)
  const domain = skill ? taxonomy.domains.find((d) => d.id === skill.domainId) : undefined
  const subject = domain ? taxonomy.subjects.find((s) => s.id === domain.subjectId) : undefined
  const stem = cell(record, 'stem')
  return {
    skillCode,
    skillName: skill?.name ?? null,
    subjectName: subject?.name ?? null,
    difficulty: cell(record, 'difficulty').toLowerCase(),
    questionType: cell(record, 'question_type').toLowerCase(),
    stem: stem.length > 140 ? `${stem.slice(0, 137)}…` : stem,
  }
}

export function validateImportRecord(
  record: Record<string, unknown>,
  rowNumber: number,
  taxonomy: ImportTaxonomy,
): ImportRowResult {
  const errors: string[] = []
  const warnings: string[] = []
  const pv = preview(record, taxonomy)

  const structural = record.__row_errors
  if (Array.isArray(structural) && structural.length > 0) {
    return { row: rowNumber, ok: false, errors: structural.map(String), preview: pv, warnings }
  }

  // Taxonomy: skill_code → domain → subject
  const skillCode = pv.skillCode
  let subjectId = ''
  let domainId = ''
  let skillId = ''
  if (!skillCode) {
    errors.push('skill_code: required.')
  } else {
    const skill = taxonomy.skills.find((s) => s.code === skillCode)
    if (!skill) {
      errors.push(`skill_code: unknown skill "${skillCode}". Use a code from Admin → Skills.`)
    } else {
      const domain = taxonomy.domains.find((d) => d.id === skill.domainId)
      const subject = domain ? taxonomy.subjects.find((s) => s.id === domain.subjectId) : undefined
      if (!domain || !subject) {
        errors.push(`skill_code: "${skillCode}" is not linked to a domain and subject.`)
      } else {
        skillId = skill.id
        domainId = domain.id
        subjectId = subject.id
        const subjectCode = cell(record, 'subject_code').toLowerCase()
        if (subjectCode && subjectCode !== subject.code) {
          errors.push(`subject_code: "${subjectCode}" does not match skill "${skillCode}" (subject ${subject.code}).`)
        }
        const domainCode = cell(record, 'domain_code').toLowerCase()
        if (domainCode && domainCode !== domain.code) {
          errors.push(`domain_code: "${domainCode}" does not match skill "${skillCode}" (domain ${domain.code}).`)
        }
      }
    }
  }

  // Enumerations with friendly messages (before schema validation)
  const difficultyRaw = cell(record, 'difficulty').toLowerCase()
  if (!difficultyRaw) errors.push('difficulty: required (easy, medium or hard).')
  else if (!['easy', 'medium', 'hard'].includes(difficultyRaw)) errors.push(`difficulty: "${difficultyRaw}" is not easy, medium or hard.`)

  const typeRaw = cell(record, 'question_type').toLowerCase().replace(/[\s-]+/g, '_')
  const questionType = TYPE_ALIASES[typeRaw]
  if (!typeRaw) errors.push('question_type: required (mc or spr).')
  else if (!questionType) errors.push(`question_type: "${typeRaw}" is not mc or spr.`)

  const passage = cell(record, 'passage')
  const stimulusRaw = cell(record, 'stimulus_type').toLowerCase()
  let stimulus: 'text' | 'passage' = passage ? 'passage' : 'text'
  if (stimulusRaw === 'image') {
    errors.push('stimulus_type: image questions need an uploaded image — create them in the question editor.')
  } else if (stimulusRaw === 'text' || stimulusRaw === 'passage') {
    stimulus = stimulusRaw
  } else if (stimulusRaw) {
    errors.push(`stimulus_type: "${stimulusRaw}" is not text or passage.`)
  }

  const sourceRaw = cell(record, 'source').toLowerCase() || 'original'
  if (!(QUESTION_SOURCES as readonly string[]).includes(sourceRaw)) {
    errors.push(`source: "${sourceRaw}" is not original, licensed or ai_generated.`)
  }

  // Options: CSV columns option_a…option_d, or a JSON "options" array.
  let optionTexts: string[] = OPTION_LABELS.map((l) => cell(record, `option_${l.toLowerCase()}`))
  if (Array.isArray(record.options)) {
    optionTexts = OPTION_LABELS.map((_, i) => {
      const v = (record.options as unknown[])[i]
      return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''
    })
    if ((record.options as unknown[]).length !== 4) errors.push('options: provide exactly 4 options (A–D).')
  }
  const correctRaw = cell(record, 'correct').toUpperCase().replace(/[()\s.]/g, '')
  const sprAnswers = list(record, 'spr_answers')
  const hasAnyOption = optionTexts.some(Boolean)

  let correct: (typeof OPTION_LABELS)[number] | null = null
  if (questionType === 'multiple_choice') {
    if (!correctRaw) errors.push('correct: mark the correct option with one letter (A, B, C or D).')
    else if ((OPTION_LABELS as readonly string[]).includes(correctRaw)) correct = correctRaw as (typeof OPTION_LABELS)[number]
    else if (/^[A-D]([,;|/][A-D])+$/.test(correctRaw) || /^[A-D]{2,4}$/.test(correctRaw))
      errors.push('correct: exactly one option can be correct.')
    else errors.push(`correct: "${cell(record, 'correct')}" is not A, B, C or D.`)
    if (sprAnswers.length > 0) errors.push('spr_answers: leave empty for multiple-choice questions.')
  } else if (questionType === 'student_produced_response') {
    if (hasAnyOption) errors.push('option_a–option_d: leave empty for student-produced responses.')
    if (correctRaw) errors.push('correct: leave empty for student-produced responses (use spr_answers).')
  }

  const secondsRaw = cell(record, 'estimated_seconds')
  let estimatedSeconds = 75
  if (secondsRaw) {
    const n = Number(secondsRaw)
    if (!Number.isInteger(n)) errors.push(`estimated_seconds: "${secondsRaw}" is not a whole number.`)
    else if (n < 10 || n > 900) errors.push('estimated_seconds: must be between 10 and 900.')
    else estimatedSeconds = n
  }

  // Shared schema (lengths, required text, SPR format, option completeness…)
  const raw: QuestionInputRaw = {
    subject_id: subjectId || '00000000-0000-0000-0000-000000000000',
    domain_id: domainId || '00000000-0000-0000-0000-000000000000',
    skill_id: skillId || '00000000-0000-0000-0000-000000000000',
    difficulty: (['easy', 'medium', 'hard'].includes(difficultyRaw) ? difficultyRaw : 'medium') as DifficultyValue,
    question_type: questionType ?? 'multiple_choice',
    stimulus_type: stimulus,
    stem: cell(record, 'stem'),
    passage,
    image_path: '',
    image_alt: '',
    options: questionType === 'student_produced_response' ? [] : OPTION_LABELS.map((label, i) => ({ label, content: optionTexts[i] ?? '' })),
    correct_option: questionType === 'multiple_choice' ? (correct ?? 'A') : null,
    spr_answers: questionType === 'student_produced_response' ? sprAnswers : [],
    explanation_en: cell(record, 'explanation_en'),
    explanation_uz: cell(record, 'explanation_uz'),
    explanation_ru: '',
    estimated_seconds: estimatedSeconds,
    tags: list(record, 'tags'),
    source: ((QUESTION_SOURCES as readonly string[]).includes(sourceRaw) ? sourceRaw : 'original') as (typeof QUESTION_SOURCES)[number],
    source_reference: cell(record, 'source_reference'),
  }
  const parsed = QuestionInputSchema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = issuesToFieldErrors(parsed.error.issues)
    for (const [path, messages] of Object.entries(fieldErrors)) {
      const column = columnForPath(path)
      // Already reported with a friendlier message above.
      if (column === 'skill_code' || column === 'correct' || column === 'difficulty' || column === 'question_type') continue
      for (const m of messages) {
        const line = `${column}: ${m}`
        if (!errors.includes(line)) errors.push(line)
      }
    }
  }

  if (errors.length > 0 || !parsed.success) {
    return { row: rowNumber, ok: false, errors, preview: pv, warnings }
  }
  return {
    row: rowNumber,
    ok: true,
    payload: buildQuestionPayload(parsed.data, { status: 'draft' }),
    preview: pv,
    warnings,
  }
}

/** Parse + validate a whole file. Rows are numbered from 1 (the first row after the CSV header). */
export function buildImportReport(text: string, taxonomy: ImportTaxonomy, format: ImportFormat | 'auto' = 'auto'): ImportReport {
  const parsed = parseImportText(text, format)
  if (parsed.fileErrors.length > 0) {
    return { format: parsed.format, fileErrors: parsed.fileErrors, warnings: parsed.warnings, rows: [], validCount: 0, invalidCount: 0 }
  }
  const rows = parsed.records.map((r, i) => validateImportRecord(r, i + 1, taxonomy))

  // Duplicate stems within the file (same skill + stem) are almost always copy/paste mistakes.
  const seen = new Map<string, number>()
  for (const row of rows) {
    if (!row.ok) continue
    const key = `${row.payload.skill_id}::${row.payload.stem.toLowerCase().replace(/\s+/g, ' ')}`
    const first = seen.get(key)
    if (first !== undefined) row.warnings.push(`Same stem and skill as row ${first}.`)
    else seen.set(key, row.row)
  }

  const validCount = rows.filter((r) => r.ok).length
  return { format: parsed.format, fileErrors: [], warnings: parsed.warnings, rows, validCount, invalidCount: rows.length - validCount }
}

/** Downloadable CSV template: header + one MC and one SPR example (genuine, solvable questions). */
export function buildCsvTemplate(): string {
  const rows = [
    {
      skill_code: 'linear_equations_one_variable',
      difficulty: 'easy',
      question_type: 'mc',
      stimulus_type: 'text',
      stem: 'If $3x + 7 = 22$, what is the value of $x$?',
      passage: '',
      option_a: '$3$',
      option_b: '$5$',
      option_c: '$7$',
      option_d: '$15$',
      correct: 'B',
      spr_answers: '',
      explanation_en: 'Subtract 7 from both sides: $3x = 15$. Divide by 3: $x = 5$.',
      explanation_uz: "Ikkala tomondan 7 ni ayiring: $3x = 15$. 3 ga bo'ling: $x = 5$.",
      estimated_seconds: '60',
      tags: 'linear|one-step',
      source: 'original',
      source_reference: '',
      subject_code: 'math',
      domain_code: 'algebra',
    },
    {
      skill_code: 'percentages',
      difficulty: 'medium',
      question_type: 'spr',
      stimulus_type: 'text',
      stem: 'A jacket costs \\$80. Its price is reduced by 15%. What is the new price, in dollars?',
      passage: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct: '',
      spr_answers: '68',
      explanation_en: '15% of 80 is $0.15 \\times 80 = 12$, so the new price is $80 - 12 = 68$.',
      explanation_uz: '',
      estimated_seconds: '75',
      tags: 'percent-change',
      source: 'original',
      source_reference: '',
      subject_code: 'math',
      domain_code: 'problem_solving_data_analysis',
    },
  ]
  return Papa.unparse({ fields: [...IMPORT_COLUMNS], data: rows.map((r) => IMPORT_COLUMNS.map((c) => r[c])) }, { newline: '\r\n' })
}
