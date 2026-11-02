import { describe, expect, it } from 'vitest'
import {
  examDateIsAcceptable,
  goalsSectionSchema,
  profileSectionSchema,
  profileUpdateSchema,
  toProfileColumns,
  toProfileDto,
} from '@/features/profile/schemas'
import { contactSchema } from '@/components/marketing/contact-schema'

describe('profileUpdateSchema (PATCH /api/student/profile whitelist)', () => {
  it('accepts a partial update of allowed fields', () => {
    const r = profileUpdateSchema.safeParse({ targetScore: 1450, timezone: 'Asia/Samarkand' })
    expect(r.success).toBe(true)
  })
  it('rejects privileged or unknown fields outright', () => {
    for (const body of [{ role: 'ADMIN' }, { is_suspended: false }, { email: 'x@y.uz' }, { fullName: 'Aziz', onboarding_completed_at: null }]) {
      const r = profileUpdateSchema.safeParse(body)
      expect(r.success).toBe(false)
    }
  })
  it('rejects an empty body', () => {
    const r = profileUpdateSchema.safeParse({})
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('nothingToUpdate')
  })
  it('validates field ranges and time zones', () => {
    expect(profileUpdateSchema.safeParse({ targetScore: 1605 }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ dailyStudyMinutes: 700 }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ locale: 'ru' }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ examDate: null }).success).toBe(true)
  })
})

describe('toProfileColumns', () => {
  it('maps camelCase fields to profile columns and nothing else', () => {
    const update = profileUpdateSchema.parse({
      fullName: 'Aziza',
      locale: 'uz',
      timezone: 'Asia/Tashkent',
      satLevel: 'new',
      targetScore: 1300,
      examDate: '2027-05-01',
      dailyStudyMinutes: 60,
      preferredSubjects: ['math'],
    })
    expect(toProfileColumns(update)).toEqual({
      full_name: 'Aziza',
      locale: 'uz',
      timezone: 'Asia/Tashkent',
      sat_level: 'new',
      target_score: 1300,
      exam_date: '2027-05-01',
      daily_study_minutes: 60,
      preferred_subjects: ['math'],
    })
  })
  it('omits fields that were not sent, but keeps an explicit null exam date', () => {
    expect(toProfileColumns(profileUpdateSchema.parse({ examDate: null }))).toEqual({ exam_date: null })
    expect(toProfileColumns(profileUpdateSchema.parse({ fullName: 'Aziz' }))).toEqual({ full_name: 'Aziz' })
  })
})

describe('settings sections', () => {
  it('profile section requires a name and a listed time zone', () => {
    expect(profileSectionSchema.safeParse({ fullName: 'Aziz', timezone: 'Asia/Tashkent' }).success).toBe(true)
    expect(profileSectionSchema.safeParse({ fullName: 'A', timezone: 'Asia/Tashkent' }).success).toBe(false)
  })
  it('goals section validates every field', () => {
    expect(goalsSectionSchema.safeParse({ targetScore: 1200, examDate: null, dailyStudyMinutes: 30, preferredSubjects: ['reading_writing'] }).success).toBe(true)
    expect(goalsSectionSchema.safeParse({ targetScore: 1200, examDate: null, dailyStudyMinutes: 30, preferredSubjects: [] }).success).toBe(false)
  })
  it('exam date must be after today in the student zone, or not set', () => {
    expect(examDateIsAcceptable(null, '2026-11-02')).toBe(true)
    expect(examDateIsAcceptable(undefined, '2026-11-02')).toBe(true)
    expect(examDateIsAcceptable('2026-11-03', '2026-11-02')).toBe(true)
    expect(examDateIsAcceptable('2026-11-02', '2026-11-02')).toBe(false)
  })
  it('toProfileDto exposes onboarding status as a boolean', () => {
    const dto = toProfileDto({
      id: 'u1',
      email: 'a@b.uz',
      full_name: 'A B',
      locale: 'en',
      timezone: 'UTC',
      sat_level: null,
      target_score: null,
      exam_date: null,
      daily_study_minutes: null,
      preferred_subjects: ['math'],
      onboarding_completed_at: '2026-11-02T10:00:00Z',
    })
    expect(dto.onboardingCompleted).toBe(true)
    expect(dto).not.toHaveProperty('role')
  })
})

describe('contact form schema (shared with POST /api/contact)', () => {
  const valid = { name: 'Aziz', email: 'Aziz@Example.com', topic: 'billing' as const, message: 'How do refunds work?' }
  it('accepts a valid message and normalizes the email', () => {
    expect(contactSchema.parse(valid).email).toBe('aziz@example.com')
  })
  it('mirrors the contact_requests constraints', () => {
    expect(contactSchema.safeParse({ ...valid, message: 'short' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...valid, message: 'x'.repeat(4001) }).success).toBe(false)
    expect(contactSchema.safeParse({ ...valid, topic: 'sales' }).success).toBe(false)
    expect(contactSchema.safeParse({ ...valid, name: '' }).success).toBe(false)
  })
})
