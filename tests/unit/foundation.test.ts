import { describe, expect, it } from 'vitest'
import { canAssignRole, hasRole, STAFF_ROLES } from '@/config/roles'
import { formatClock, formatDuration, formatMoney, safeRedirectPath } from '@/lib/utils'
import { addDays, daysBetween, localDate, startOfLocalDay, startOfLocalMonth } from '@/lib/time'
import { defineDict, format, plural, resolveDict } from '@/lib/i18n/dict'

describe('role hierarchy (mirrors admin_set_user_role)', () => {
  it('lets super admins assign anything', () => {
    expect(canAssignRole('SUPER_ADMIN', 'ADMIN', 'SUPER_ADMIN')).toBe(true)
  })
  it('lets admins manage only lower roles', () => {
    expect(canAssignRole('ADMIN', 'STUDENT', 'CONTENT_EDITOR')).toBe(true)
    expect(canAssignRole('ADMIN', 'STUDENT', 'ADMIN')).toBe(false)
    expect(canAssignRole('ADMIN', 'ADMIN', 'STUDENT')).toBe(false)
  })
  it('denies non-admins', () => {
    expect(canAssignRole('CONTENT_EDITOR', 'STUDENT', 'TEACHER')).toBe(false)
    expect(canAssignRole('STUDENT', 'STUDENT', 'STUDENT')).toBe(false)
  })
  it('checks membership', () => {
    expect(hasRole('TEACHER', STAFF_ROLES)).toBe(true)
    expect(hasRole('STUDENT', STAFF_ROLES)).toBe(false)
    expect(hasRole(null, STAFF_ROLES)).toBe(false)
  })
})

describe('safeRedirectPath (open-redirect protection)', () => {
  it('allows same-origin relative paths', () => {
    expect(safeRedirectPath('/dashboard/practice?skill=x')).toBe('/dashboard/practice?skill=x')
  })
  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeRedirectPath('https://evil.example')).toBe('/dashboard')
    expect(safeRedirectPath('//evil.example')).toBe('/dashboard')
    expect(safeRedirectPath('/\\evil.example')).toBe('/dashboard')
    expect(safeRedirectPath(null, '/x')).toBe('/x')
  })
})

describe('formatting', () => {
  it('formats UZS minor units without decimals', () => {
    expect(formatMoney(9_900_000, 'UZS')).toBe('99,000 UZS')
  })
  it('formats USD cents', () => {
    expect(formatMoney(1900, 'USD')).toBe('$19.00')
  })
  it('formats clocks and durations', () => {
    expect(formatClock(1925)).toBe('32:05')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-5)).toBe('0:00')
    expect(formatDuration(95)).toBe('1m 35s')
    expect(formatDuration(3725)).toBe('1h 2m')
  })
})

describe('time zones', () => {
  const at = new Date('2026-11-01T20:30:00Z') // 01:30 on 2 Nov in Tashkent (UTC+5)
  it('computes the local date', () => {
    expect(localDate('Asia/Tashkent', at)).toBe('2026-11-02')
    expect(localDate('UTC', at)).toBe('2026-11-01')
  })
  it('computes local midnight as a UTC instant', () => {
    expect(startOfLocalDay('Asia/Tashkent', at).toISOString()).toBe('2026-11-01T19:00:00.000Z')
    expect(startOfLocalMonth('Asia/Tashkent', at).toISOString()).toBe('2026-10-31T19:00:00.000Z')
  })
  it('does date arithmetic', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-11-02', '2026-12-05')).toBe(33)
  })
})

describe('i18n dictionaries', () => {
  const dict = defineDict({
    en: { hello: 'Hello, {name}', nested: { a: 'A' } },
    uz: { hello: 'Salom, {name}', nested: { a: 'A-uz' } },
    ru: { hello: 'Здравствуйте, {name}', nested: { a: 'A-ru' } },
  })
  it('resolves every locale', () => {
    expect(resolveDict(dict, 'uz').hello).toBe('Salom, {name}')
    expect(resolveDict(dict, 'ru').nested.a).toBe('A-ru')
    expect(resolveDict(dict, 'en').hello).toBe('Hello, {name}')
  })
  it('interpolates and pluralizes', () => {
    expect(format('Hello, {name}', { name: 'Aziza' })).toBe('Hello, Aziza')
    expect(format('{missing}', {})).toBe('{missing}')
    expect(plural(1, { one: '{n} question', other: '{n} questions' })).toBe('1 question')
    expect(plural(3, { one: '{n} question', other: '{n} questions' })).toBe('3 questions')
  })
})
