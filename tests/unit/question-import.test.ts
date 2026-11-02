import { describe, expect, it } from 'vitest'
import Papa from 'papaparse'
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  buildCsvTemplate,
  buildImportReport,
  detectFormat,
  normalizeHeader,
  parseImportText,
  validateImportRecord,
  type ImportTaxonomy,
} from '@/features/content/question-import'

const IDS = {
  math: '11111111-1111-4111-8111-111111111111',
  rw: '22222222-2222-4222-8222-222222222222',
  algebra: '33333333-3333-4333-8333-333333333333',
  psda: '44444444-4444-4444-8444-444444444444',
  sec: '55555555-5555-4555-8555-555555555555',
  linear: '66666666-6666-4666-8666-666666666666',
  linearOne: '77777777-7777-4777-8777-777777777777',
  percentages: '88888888-8888-4888-8888-888888888888',
  boundaries: '99999999-9999-4999-8999-999999999999',
}

const taxonomy: ImportTaxonomy = {
  subjects: [
    { id: IDS.math, code: 'math', name: 'Math' },
    { id: IDS.rw, code: 'reading_writing', name: 'Reading and Writing' },
  ],
  domains: [
    { id: IDS.algebra, subjectId: IDS.math, code: 'algebra', name: 'Algebra' },
    { id: IDS.psda, subjectId: IDS.math, code: 'problem_solving_data_analysis', name: 'Problem-Solving and Data Analysis' },
    { id: IDS.sec, subjectId: IDS.rw, code: 'standard_english_conventions', name: 'Standard English Conventions' },
  ],
  skills: [
    { id: IDS.linear, domainId: IDS.algebra, code: 'linear_functions', name: 'Linear functions' },
    { id: IDS.linearOne, domainId: IDS.algebra, code: 'linear_equations_one_variable', name: 'Linear equations in one variable' },
    { id: IDS.percentages, domainId: IDS.psda, code: 'percentages', name: 'Percentages' },
    { id: IDS.boundaries, domainId: IDS.sec, code: 'boundaries', name: 'Boundaries' },
  ],
}

const HEADER = 'skill_code,difficulty,question_type,stem,option_a,option_b,option_c,option_d,correct,spr_answers,explanation_en'
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n')
const MC_ROW = 'linear_functions,easy,mc,"What is the slope of $y = 2x + 3$?",2,3,-2,1/2,A,,"The slope is the coefficient of $x$."'
const SPR_ROW = 'percentages,medium,spr,What is 15% of 80?,,,,,,12|12.0,"$0.15 \\times 80 = 12$"'

function mc(overrides: Record<string, unknown> = {}) {
  return {
    skill_code: 'linear_functions',
    difficulty: 'easy',
    question_type: 'mc',
    stem: 'What is the slope of $y = 2x + 3$?',
    option_a: '2',
    option_b: '3',
    option_c: '-2',
    option_d: '1/2',
    correct: 'A',
    explanation_en: 'The slope is 2.',
    ...overrides,
  }
}
function spr(overrides: Record<string, unknown> = {}) {
  return {
    skill_code: 'percentages',
    difficulty: 'medium',
    question_type: 'spr',
    stem: 'What is 15% of 80?',
    spr_answers: '12',
    explanation_en: '0.15 × 80 = 12',
    ...overrides,
  }
}
function errorsOf(record: Record<string, unknown>) {
  const r = validateImportRecord(record, 1, taxonomy)
  return r.ok ? [] : r.errors
}

describe('parsing', () => {
  it('normalizes headers (case, spaces, dashes, BOM)', () => {
    expect(normalizeHeader('﻿Skill Code')).toBe('skill_code')
    expect(normalizeHeader(' Option-A ')).toBe('option_a')
    expect(normalizeHeader('EXPLANATION_EN')).toBe('explanation_en')
  })

  it('detects JSON vs CSV', () => {
    expect(detectFormat('  [{"a":1}]')).toBe('json')
    expect(detectFormat('{"questions": []}')).toBe('json')
    expect(detectFormat(HEADER)).toBe('csv')
  })

  it('reports an empty input', () => {
    expect(parseImportText('   ').fileErrors[0]).toMatch(/Paste CSV or JSON/)
  })

  it('reports missing required columns', () => {
    const p = parseImportText('skill_code,difficulty\nlinear_functions,easy')
    expect(p.fileErrors.join(' ')).toMatch(/Missing required columns: question_type, stem, explanation_en/)
  })

  it('warns about unknown columns but keeps going', () => {
    const p = parseImportText(`${HEADER},notes\n${MC_ROW},hello`)
    expect(p.fileErrors).toEqual([])
    expect(p.warnings.join(' ')).toMatch(/Ignored unknown column: notes/)
  })

  it('reports duplicate columns', () => {
    const p = parseImportText('skill_code,stem,stem,difficulty,question_type,explanation_en\na,b,c,easy,mc,x')
    expect(p.fileErrors.join(' ')).toMatch(/Duplicate column: stem/)
  })

  it('handles BOM, CRLF line endings, quoted commas, escaped quotes and multi-line cells', () => {
    const text =
      '﻿' +
      [
        HEADER,
        'linear_functions,easy,mc,"Line one, with a comma\nline two ""quoted""",2,3,-2,1/2,A,,"Because, reasons."',
        '',
        MC_ROW,
      ].join('\r\n')
    const report = buildImportReport(text, taxonomy)
    expect(report.fileErrors).toEqual([])
    expect(report.rows).toHaveLength(2) // blank line skipped
    const first = report.rows[0]!
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.payload.stem).toBe('Line one, with a comma\nline two "quoted"')
      expect(first.payload.explanations[0]).toEqual({ locale: 'en', content: 'Because, reasons.' })
    }
  })

  it('reports rows with the wrong number of fields per row', () => {
    const report = buildImportReport(csv('linear_functions,easy,mc,stem only'), taxonomy)
    expect(report.rows[0]!.ok).toBe(false)
    expect(!report.rows[0]!.ok && report.rows[0]!.errors[0]).toMatch(/fewer columns/)
  })

  it('rejects files with too many rows', () => {
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, () => MC_ROW)
    const p = parseImportText(csv(...rows))
    expect(p.fileErrors.join(' ')).toMatch(/Too many rows/)
  })

  it('parses JSON arrays and { questions: [...] } with array values', () => {
    const report = buildImportReport(
      JSON.stringify({
        questions: [
          { ...mc(), option_a: undefined, option_b: undefined, option_c: undefined, option_d: undefined, options: ['2', '3', '-2', '1/2'] },
          { ...spr(), spr_answers: ['3/4', '.75', 0.75], tags: ['percent', 'easy-win'] },
        ],
      }),
      taxonomy,
    )
    expect(report.format).toBe('json')
    expect(report.fileErrors).toEqual([])
    expect(report.validCount).toBe(2)
    const second = report.rows[1]!
    expect(second.ok && second.payload.spr_answers).toEqual(['3/4', '.75', '0.75'])
    expect(second.ok && second.payload.tags).toEqual(['percent', 'easy-win'])
  })

  it('reports invalid JSON and non-array JSON', () => {
    expect(parseImportText('[{"a":').fileErrors[0]).toMatch(/JSON could not be read/)
    expect(parseImportText('{"a": 1}').fileErrors[0]).toMatch(/array of question objects/)
    const r = buildImportReport('[1, {"skill_code":"x"}]', taxonomy)
    expect(!r.rows[0]!.ok && r.rows[0]!.errors[0]).toMatch(/must be a JSON object/)
  })
})

describe('row validation', () => {
  it('accepts a good multiple-choice row and maps skill → domain → subject', () => {
    const r = validateImportRecord(mc({ tags: 'slope|linear', estimated_seconds: '60', explanation_uz: "Qiyalik 2 ga teng." }), 1, taxonomy)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload).toMatchObject({
      subject_id: IDS.math,
      domain_id: IDS.algebra,
      skill_id: IDS.linear,
      difficulty: 'easy',
      question_type: 'multiple_choice',
      stimulus_type: 'text',
      status: 'draft',
      estimated_seconds: 60,
      tags: ['slope', 'linear'],
      spr_answers: [],
    })
    expect(r.payload.options).toEqual([
      { label: 'A', content: '2', is_correct: true },
      { label: 'B', content: '3', is_correct: false },
      { label: 'C', content: '-2', is_correct: false },
      { label: 'D', content: '1/2', is_correct: false },
    ])
    expect(r.payload.explanations.map((e) => e.locale)).toEqual(['en', 'uz'])
    expect(r.preview.subjectName).toBe('Math')
  })

  it('accepts a good SPR row with several equivalent answers (trimmed)', () => {
    const r = validateImportRecord(spr({ spr_answers: ' 3/4 | .75 | 0.75 ' }), 1, taxonomy)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.payload.question_type).toBe('student_produced_response')
      expect(r.payload.spr_answers).toEqual(['3/4', '.75', '0.75'])
      expect(r.payload.options).toEqual([])
    }
  })

  it('flags duplicate SPR answers within a row', () => {
    expect(errorsOf(spr({ spr_answers: '3/4|3/4' })).join(' ')).toMatch(/listed twice/)
  })

  it('always imports as draft, whatever the file says', () => {
    const r = validateImportRecord(mc({ status: 'published' }), 1, taxonomy)
    expect(r.ok && r.payload.status).toBe('draft')
  })

  it('infers a passage stimulus and accepts explicit text/passage', () => {
    const r = validateImportRecord(mc({ passage: 'A short passage.' }), 1, taxonomy)
    expect(r.ok && r.payload.stimulus_type).toBe('passage')
    expect(errorsOf(mc({ stimulus_type: 'passage' })).join(' ')).toMatch(/passage: A passage question needs passage text/)
  })

  it('rejects image stimulus (needs the editor upload) and unknown stimulus types', () => {
    expect(errorsOf(mc({ stimulus_type: 'image' })).join(' ')).toMatch(/image questions need an uploaded image/)
    expect(errorsOf(mc({ stimulus_type: 'video' })).join(' ')).toMatch(/"video" is not text or passage/)
  })

  it('reports unknown and missing skill codes', () => {
    expect(errorsOf(mc({ skill_code: 'quadratics' }))).toContain('skill_code: unknown skill "quadratics". Use a code from Admin → Skills.')
    expect(errorsOf(mc({ skill_code: '' }))).toContain('skill_code: required.')
  })

  it('matches skill codes case-insensitively', () => {
    expect(validateImportRecord(mc({ skill_code: 'Linear_Functions' }), 1, taxonomy).ok).toBe(true)
  })

  it('reports subject/domain codes that contradict the skill', () => {
    const errors = errorsOf(mc({ subject_code: 'reading_writing', domain_code: 'advanced_math' }))
    expect(errors.join(' ')).toMatch(/subject_code: "reading_writing" does not match/)
    expect(errors.join(' ')).toMatch(/domain_code: "advanced_math" does not match/)
    expect(validateImportRecord(mc({ subject_code: 'math', domain_code: 'algebra' }), 1, taxonomy).ok).toBe(true)
  })

  it('validates difficulty and question type', () => {
    expect(errorsOf(mc({ difficulty: 'expert' }))).toContain('difficulty: "expert" is not easy, medium or hard.')
    expect(errorsOf(mc({ difficulty: '' }))).toContain('difficulty: required (easy, medium or hard).')
    expect(errorsOf(mc({ question_type: 'essay' }))).toContain('question_type: "essay" is not mc or spr.')
    expect(errorsOf(mc({ question_type: '' }))).toContain('question_type: required (mc or spr).')
    expect(validateImportRecord(mc({ question_type: 'Multiple Choice', difficulty: 'HARD' }), 1, taxonomy).ok).toBe(true)
  })

  it('requires all four options for multiple choice', () => {
    expect(errorsOf(mc({ option_c: '' }))).toContain('option_c: Write option C.')
  })

  it('rejects duplicate option text', () => {
    expect(errorsOf(mc({ option_b: '2' })).join(' ')).toMatch(/Two options have the same text/)
  })

  it('requires exactly one valid correct letter', () => {
    expect(errorsOf(mc({ correct: '' }))).toContain('correct: mark the correct option with one letter (A, B, C or D).')
    expect(errorsOf(mc({ correct: 'A,C' }))).toContain('correct: exactly one option can be correct.')
    expect(errorsOf(mc({ correct: 'AB' }))).toContain('correct: exactly one option can be correct.')
    expect(errorsOf(mc({ correct: 'E' }))).toContain('correct: "E" is not A, B, C or D.')
    const lower = validateImportRecord(mc({ correct: '(b)' }), 1, taxonomy)
    expect(lower.ok && lower.payload.options.find((o) => o.is_correct)?.label).toBe('B')
  })

  it('rejects spr_answers on multiple choice and options/correct on SPR', () => {
    expect(errorsOf(mc({ spr_answers: '2' }))).toContain('spr_answers: leave empty for multiple-choice questions.')
    const errors = errorsOf(spr({ option_a: '12', correct: 'A' }))
    expect(errors).toContain('option_a–option_d: leave empty for student-produced responses.')
    expect(errors).toContain('correct: leave empty for student-produced responses (use spr_answers).')
  })

  it('validates SPR answers with the scoring rules', () => {
    expect(errorsOf(spr({ spr_answers: '' }))).toContain('spr_answers: Add at least one accepted answer.')
    expect(errorsOf(spr({ spr_answers: '3 1/2' })).join(' ')).toMatch(/Mixed numbers are not accepted/)
    expect(errorsOf(spr({ spr_answers: '123456' })).join(' ')).toMatch(/Too long/)
    expect(errorsOf(spr({ spr_answers: '12 cm' })).join(' ')).toMatch(/Use a number, decimal or fraction/)
    expect(errorsOf(spr({ spr_answers: '1/0' })).join(' ')).toMatch(/denominator cannot be zero/)
    expect(validateImportRecord(spr({ spr_answers: '-12345' }), 1, taxonomy).ok).toBe(true)
  })

  it('requires the stem and the English explanation', () => {
    expect(errorsOf(mc({ stem: '   ' }))).toContain('stem: Write the question stem.')
    expect(errorsOf(mc({ explanation_en: '' }))).toContain('explanation_en: An English explanation is required.')
  })

  it('enforces length limits', () => {
    expect(errorsOf(mc({ stem: 'x'.repeat(5001) })).join(' ')).toMatch(/stem: The stem can be at most 5000 characters/)
    expect(errorsOf(mc({ option_a: 'x'.repeat(2001) })).join(' ')).toMatch(/option_a: Options can be at most 2000 characters/)
    expect(errorsOf(mc({ passage: 'x'.repeat(10001) })).join(' ')).toMatch(/passage: The passage can be at most 10000 characters/)
    expect(errorsOf(mc({ tags: 'x'.repeat(41) })).join(' ')).toMatch(/tags: Tags can be at most 40 characters/)
  })

  it('validates estimated_seconds and source', () => {
    expect(errorsOf(mc({ estimated_seconds: '5' }))).toContain('estimated_seconds: must be between 10 and 900.')
    expect(errorsOf(mc({ estimated_seconds: '1.5' }))).toContain('estimated_seconds: "1.5" is not a whole number.')
    expect(errorsOf(mc({ source: 'scraped' })).join(' ')).toMatch(/source: "scraped" is not original/)
    const licensed = validateImportRecord(mc({ source: 'licensed', source_reference: 'Partner pack 2026' }), 1, taxonomy)
    expect(licensed.ok && licensed.payload.source_reference).toBe('Partner pack 2026')
  })

  it('collects several errors for one row', () => {
    const errors = errorsOf({ skill_code: 'nope', difficulty: 'x', question_type: 'mc', stem: '', correct: 'Z' })
    expect(errors.length).toBeGreaterThanOrEqual(4)
  })
})

describe('import report', () => {
  it('counts valid and invalid rows and numbers rows from 1', () => {
    const report = buildImportReport(csv(MC_ROW, 'unknown_skill,easy,mc,Q?,1,2,3,4,A,,E', SPR_ROW), taxonomy)
    expect(report.validCount).toBe(2)
    expect(report.invalidCount).toBe(1)
    expect(report.rows.map((r) => [r.row, r.ok])).toEqual([
      [1, true],
      [2, false],
      [3, true],
    ])
  })

  it('warns about duplicate stems for the same skill within the file', () => {
    const report = buildImportReport(csv(MC_ROW, MC_ROW), taxonomy)
    expect(report.rows[1]!.warnings[0]).toBe('Same stem and skill as row 1.')
  })

  it('returns file errors without rows when the file is unusable', () => {
    const report = buildImportReport('stem\nhello', taxonomy)
    expect(report.rows).toEqual([])
    expect(report.fileErrors.length).toBeGreaterThan(0)
  })
})

describe('CSV template', () => {
  it('has every column and its example rows validate', () => {
    const template = buildCsvTemplate()
    const parsed = Papa.parse<string[]>(template)
    expect(parsed.data[0]).toEqual([...IMPORT_COLUMNS])
    const report = buildImportReport(template, {
      ...taxonomy,
      domains: [...taxonomy.domains],
    })
    expect(report.fileErrors).toEqual([])
    expect(report.rows.map((r) => (r.ok ? 'ok' : r.errors.join('; ')))).toEqual(['ok', 'ok'])
  })
})
