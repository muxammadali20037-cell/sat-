import { describe, expect, it } from 'vitest'
import {
  aggregate,
  bucketKey,
  bucketLabels,
  countBy,
  distinctPerBucket,
  lastBuckets,
  localMidnightIso,
  mondayOf,
  revenueByCurrency,
  revenueWindow,
  seriesTotal,
} from '@/features/admin/series'
import { parseSettingInput, settingKind, settingToInput, validateSettingValue } from '@/features/admin/settings-values'
import { isExpectedDbError, mapDbError } from '@/features/admin/db-errors'
import { buildHref, dateParam, oneOf, pageFromParam, sanitizeSearch, uuidParam } from '@/features/admin/params'
import { diffJson, formatDiffValue, stableStringify } from '@/features/admin/audit-diff'
import { compactMajor, excerpt, formatUsdMicros, timeAgo } from '@/features/admin/format'

const TZ = 'Asia/Tashkent' // UTC+5, no DST

describe('series bucketing', () => {
  it('keys timestamps in the business time zone', () => {
    // 2026-03-31T20:00Z is already April 1 in Tashkent.
    expect(bucketKey('2026-03-31T20:00:00Z', 'day', TZ)).toBe('2026-04-01')
    expect(bucketKey('2026-03-31T20:00:00Z', 'month', TZ)).toBe('2026-04')
    expect(bucketKey('2026-03-31T18:00:00Z', 'month', TZ)).toBe('2026-03')
  })

  it('keeps date-only values as local dates', () => {
    expect(bucketKey('2026-11-02', 'day', TZ)).toBe('2026-11-02')
  })

  it('starts weeks on Monday', () => {
    expect(mondayOf('2026-11-02')).toBe('2026-11-02') // Monday
    expect(mondayOf('2026-11-08')).toBe('2026-11-02') // Sunday
    expect(bucketKey('2026-11-05', 'week', TZ)).toBe('2026-11-02')
  })

  it('builds the last N buckets ending at now, across year boundaries', () => {
    const now = new Date('2026-02-10T12:00:00Z')
    expect(lastBuckets('month', 4, now, TZ)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(lastBuckets('day', 3, now, TZ)).toEqual(['2026-02-08', '2026-02-09', '2026-02-10'])
    expect(lastBuckets('week', 2, now, TZ)).toEqual(['2026-02-02', '2026-02-09'])
  })

  it('computes local midnight as a UTC instant', () => {
    expect(localMidnightIso('2026-01-01', TZ)).toBe('2025-12-31T19:00:00.000Z')
    expect(localMidnightIso('2026-07-01', 'UTC')).toBe('2026-07-01T00:00:00.000Z')
  })

  it('labels buckets', () => {
    expect(bucketLabels('2026-03', 'month')).toEqual({ label: 'Mar', fullLabel: 'March 2026' })
    expect(bucketLabels('2026-11-02', 'week')).toEqual({ label: '2 Nov', fullLabel: 'Week of 2 Nov 2026' })
    expect(bucketLabels('2026-11-02', 'day').fullLabel).toBe('2 Nov 2026')
  })

  it('aggregates values into buckets and ignores rows outside the window', () => {
    const keys = ['2026-11-01', '2026-11-02']
    const rows = [
      { at: '2026-11-01', n: 2 },
      { at: '2026-11-02', n: 3 },
      { at: '2026-11-02', n: 1 },
      { at: '2026-10-01', n: 99 },
      { at: null, n: 5 },
    ]
    const points = aggregate(rows, keys, 'day', (r) => r.at, (r) => r.n, TZ)
    expect(points.map((p) => p.value)).toEqual([2, 4])
    expect(seriesTotal(points)).toBe(6)
    // count when no value function is passed
    expect(aggregate(rows, keys, 'day', (r) => r.at).map((p) => p.value)).toEqual([1, 2])
  })

  it('counts distinct ids per bucket', () => {
    const rows = [
      { d: '2026-11-02', u: 'a' },
      { d: '2026-11-03', u: 'a' },
      { d: '2026-11-04', u: 'b' },
      { d: '2026-11-09', u: 'a' },
    ]
    const points = distinctPerBucket(rows, ['2026-11-02', '2026-11-09'], 'week', (r) => r.d, (r) => r.u, TZ)
    expect(points.map((p) => p.value)).toEqual([2, 1])
  })

  it('never adds different currencies together; UZS comes first', () => {
    const keys = ['2026-10', '2026-11']
    const series = revenueByCurrency(
      [
        { at: '2026-10-10T10:00:00Z', amountMinor: 9_900_000, currency: 'UZS' },
        { at: '2026-11-01T10:00:00Z', amountMinor: 19_900_000, currency: 'UZS' },
        { at: '2026-11-02T10:00:00Z', amountMinor: 1_900, currency: 'USD' },
        { at: '2025-01-02T10:00:00Z', amountMinor: 5_000, currency: 'USD' }, // outside window
      ],
      keys,
      'month',
      TZ,
    )
    expect(series.map((s) => s.currency)).toEqual(['UZS', 'USD'])
    expect(series[0]).toMatchObject({ totalMinor: 29_800_000, count: 2 })
    expect(series[0]!.points.map((p) => p.value)).toEqual([9_900_000, 19_900_000])
    expect(series[1]).toMatchObject({ totalMinor: 1_900, count: 1 })
  })

  it('builds revenue windows for each period', () => {
    const now = new Date('2026-11-02T08:00:00Z')
    const year = revenueWindow('year', now, TZ)
    expect(year.granularity).toBe('month')
    expect(year.keys[0]).toBe('2026-01')
    expect(year.keys).toHaveLength(11)
    expect(year.startIso).toBe('2025-12-31T19:00:00.000Z')
    const six = revenueWindow('6m', now, TZ)
    expect(six.keys).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    const days = revenueWindow('30d', now, TZ)
    expect(days.granularity).toBe('day')
    expect(days.keys).toHaveLength(30)
    expect(days.keys.at(-1)).toBe('2026-11-02')
  })

  it('counts by key keeping the requested order (and zeros)', () => {
    const result = countBy([{ l: 'advanced' }, { l: 'foundation' }, { l: 'advanced' }], (r) => r.l, ['foundation', 'developing', 'proficient', 'advanced'])
    expect(result).toEqual([
      { key: 'foundation', count: 1 },
      { key: 'developing', count: 0 },
      { key: 'proficient', count: 0 },
      { key: 'advanced', count: 2 },
    ])
  })
})

describe('settings values', () => {
  it('detects the JSON kind of a value', () => {
    expect(settingKind(3)).toBe('number')
    expect(settingKind(true)).toBe('boolean')
    expect(settingKind('')).toBe('string')
    expect(settingKind({ a: 1 })).toBe('json')
    expect(settingKind(null)).toBe('json')
  })

  it('renders values for inputs', () => {
    expect(settingToInput(0.9)).toBe('0.9')
    expect(settingToInput(false)).toBe('false')
    expect(settingToInput('a@b.uz')).toBe('a@b.uz')
    expect(settingToInput({ a: 1 })).toBe('{\n  "a": 1\n}')
  })

  it('parses numbers strictly', () => {
    expect(parseSettingInput('number', ' 3 ')).toEqual({ ok: true, value: 3 })
    expect(parseSettingInput('number', '.5')).toEqual({ ok: true, value: 0.5 })
    expect(parseSettingInput('number', '-2')).toEqual({ ok: true, value: -2 })
    expect(parseSettingInput('number', '')).toMatchObject({ ok: false })
    expect(parseSettingInput('number', '1e3')).toMatchObject({ ok: false })
    expect(parseSettingInput('number', '3 days')).toMatchObject({ ok: false })
  })

  it('parses booleans, strings and JSON', () => {
    expect(parseSettingInput('boolean', 'TRUE')).toEqual({ ok: true, value: true })
    expect(parseSettingInput('boolean', 'yes')).toMatchObject({ ok: false })
    expect(parseSettingInput('string', '  hi  ')).toEqual({ ok: true, value: 'hi' })
    expect(parseSettingInput('json', '{"a": [1, 2]}')).toEqual({ ok: true, value: { a: [1, 2] } })
    expect(parseSettingInput('json', '{"a": ')).toMatchObject({ ok: false })
    expect(parseSettingInput('json', '42')).toMatchObject({ ok: false, error: 'This setting holds a JSON object or array.' })
  })

  it('keeps the stored type and applies rules for known keys', () => {
    expect(validateSettingValue('billing.grace_period_days', 3, '7')).toEqual({ ok: true, value: 7 })
    expect(validateSettingValue('billing.grace_period_days', 3, '2.5')).toMatchObject({ ok: false })
    expect(validateSettingValue('billing.grace_period_days', 3, '45')).toMatchObject({ ok: false })
    expect(validateSettingValue('lessons.completion_ratio', 0.9, '1.2')).toMatchObject({ ok: false })
    expect(validateSettingValue('lessons.completion_ratio', 0.9, '0.85')).toEqual({ ok: true, value: 0.85 })
    expect(validateSettingValue('contact.support_email', '', 'not-an-email')).toMatchObject({ ok: false })
    expect(validateSettingValue('contact.support_email', '', '')).toEqual({ ok: true, value: '' })
    expect(validateSettingValue('contact.support_email', '', 'help@satmaster.uz')).toEqual({ ok: true, value: 'help@satmaster.uz' })
    expect(validateSettingValue('ai.pricing_usd_per_mtok', {}, '{"m": {"input": 3, "output": 15}}')).toMatchObject({ ok: true })
    expect(validateSettingValue('ai.pricing_usd_per_mtok', {}, '{"m": {"input": -1, "output": 15}}')).toMatchObject({ ok: false })
    expect(validateSettingValue('custom.flag', true, 'false')).toEqual({ ok: true, value: false })
  })
})

describe('database error mapping', () => {
  it('maps foreign-key violations on delete to "in use", and on insert to the constraint message', () => {
    const msg = mapDbError(
      { code: '23503', message: 'update or delete on table "skills" violates foreign key constraint "questions_skill_id_domain_id_fkey" on table "questions"' },
      { entity: 'skill', inUse: 'This skill is used by questions.' },
    )
    expect(msg).toBe('This skill is used by questions.')
    expect(
      mapDbError({ code: '23503', message: 'insert or update on table "questions" violates foreign key constraint "questions_skill_id_domain_id_fkey"' }),
    ).toBe('The selected skill does not belong to the selected domain.')
    expect(mapDbError({ code: '23503', message: 'update or delete on table "domains" violates foreign key constraint "skills_domain_id_fkey"' }, { entity: 'domain' })).toMatch(
      /This domain is still in use/,
    )
    expect(
      mapDbError({ code: '23503', message: 'update or delete on table "courses" violates foreign key constraint "lessons_course_id_fkey"' }, { inUse: 'Has lessons.' }),
    ).toBe('Has lessons.')
  })

  it('maps unique violations by constraint', () => {
    expect(mapDbError({ code: '23505', message: 'duplicate key value violates unique constraint "courses_slug_key"' })).toBe('A course with this slug already exists.')
    expect(mapDbError({ code: '23505', message: 'duplicate key value violates unique constraint "x_key"' }, { duplicate: 'Dup.' })).toBe('Dup.')
  })

  it('shows publish-guard messages without internal ids', () => {
    expect(mapDbError({ code: '23514', message: 'Text lesson 6f1c2c0e-1111-4111-8111-111111111111 needs lesson notes before publishing' })).toBe(
      'This text lesson needs lesson notes before publishing',
    )
    expect(mapDbError({ code: '23514', message: 'Questions must be reviewed before publishing' })).toBe('Questions must be reviewed before publishing')
    expect(mapDbError({ code: '23514', message: 'new row for relation "lessons" violates check constraint "lessons_check"' })).toBe(
      'Set the lesson duration (greater than 0) before publishing.',
    )
  })

  it('maps permission and not-found errors', () => {
    expect(mapDbError({ code: '42501', message: 'Not allowed' })).toBe('You do not have permission to do this.')
    expect(mapDbError({ code: '42501', message: 'You cannot change your own role' })).toBe('You cannot change your own role.')
    expect(mapDbError({ code: '42501', message: 'new row violates row-level security policy for table "x"' })).toBe('You do not have permission to change this.')
    expect(mapDbError({ code: 'P0002', message: 'User not found' })).toBe('User not found')
    expect(mapDbError({ code: 'XX000', message: 'boom' })).toMatch(/Something went wrong/)
    expect(mapDbError(null)).toMatch(/Something went wrong/)
  })

  it('classifies expected errors', () => {
    expect(isExpectedDbError({ code: '23505' })).toBe(true)
    expect(isExpectedDbError({ code: '08006' })).toBe(false)
  })
})

describe('list params', () => {
  it('sanitizes free-text search for PostgREST filters', () => {
    expect(sanitizeSearch('  ali,(x)*%  ')).toBe('ali x')
    expect(sanitizeSearch("O'Brien")).toBe("O'Brien")
    expect(sanitizeSearch('Ғулом@mail.uz')).toBe('Ғулом@mail.uz')
    expect(sanitizeSearch('a'.repeat(200))).toHaveLength(80)
  })

  it('parses pages, enums, uuids and dates defensively', () => {
    expect(pageFromParam('3')).toBe(3)
    expect(pageFromParam('-1')).toBe(1)
    expect(pageFromParam(['2', '5'])).toBe(2)
    expect(pageFromParam('abc')).toBe(1)
    expect(oneOf('draft', ['draft', 'published'] as const)).toBe('draft')
    expect(oneOf('evil', ['draft', 'published'] as const)).toBe('')
    expect(oneOf('evil', ['draft', 'published'] as const, 'published')).toBe('published')
    expect(uuidParam('6f1c2c0e-1111-4111-8111-111111111111')).toBe('6f1c2c0e-1111-4111-8111-111111111111')
    expect(uuidParam("1' or 1=1")).toBe('')
    expect(dateParam('2026-11-02')).toBe('2026-11-02')
    expect(dateParam('2026-13-45')).toBe('')
  })

  it('builds hrefs without empty params or page=1', () => {
    expect(buildHref('/admin/questions', { q: 'slope', status: '', page: 1 })).toBe('/admin/questions?q=slope')
    expect(buildHref('/admin/questions', { page: 2, skill: undefined })).toBe('/admin/questions?page=2')
    expect(buildHref('/admin', {})).toBe('/admin')
  })
})

describe('audit diff', () => {
  it('lists changed, added and removed fields, timestamps last', () => {
    const entries = diffJson(
      { status: 'draft', stem: 'a', updated_at: '1', tags: ['x'], removed: 1 },
      { status: 'published', stem: 'a', updated_at: '2', tags: ['x'], added: true },
    )
    expect(entries.map((e) => [e.key, e.change])).toEqual([
      ['added', 'added'],
      ['removed', 'removed'],
      ['status', 'changed'],
      ['updated_at', 'changed'],
    ])
  })

  it('handles inserts, deletes and scalar snapshots', () => {
    expect(diffJson(null, { a: 1 })).toEqual([{ key: 'a', before: undefined, after: 1, change: 'added' }])
    expect(diffJson({ a: 1 }, null)[0]!.change).toBe('removed')
    expect(diffJson(1, 2)).toEqual([{ key: 'value', before: 1, after: 2, change: 'changed' }])
    expect(diffJson({ a: 1 }, { a: 1 }, { includeSame: true })[0]!.change).toBe('same')
  })

  it('compares objects independent of key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
    expect(diffJson({ v: { x: 1, y: 2 } }, { v: { y: 2, x: 1 } })).toEqual([])
  })

  it('formats values compactly', () => {
    expect(formatDiffValue(undefined)).toBe('—')
    expect(formatDiffValue(null)).toBe('null')
    expect(formatDiffValue('x'.repeat(500), 10)).toHaveLength(10)
  })
})

describe('admin formatting', () => {
  it('formats USD micros, compact money and relative time', () => {
    expect(formatUsdMicros(1_234_567)).toBe('$1.23')
    expect(compactMajor(12_500_000)).toBe('125K')
    const now = new Date('2026-11-02T12:00:00Z')
    expect(timeAgo('2026-11-02T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-11-02T11:00:00Z', now)).toBe('1 h ago')
    expect(timeAgo('2026-10-30T12:00:00Z', now)).toBe('3 d ago')
    expect(timeAgo(null, now)).toBe('never')
  })

  it('makes plain excerpts of rich text', () => {
    expect(excerpt('If **$3x + 7 = 22$**, what is *x*?')).toBe('If 3x + 7 = 22, what is x?')
    expect(excerpt('word '.repeat(50), 20)).toHaveLength(20)
  })
})
