import { describe, expect, it } from 'vitest'
import {
  changePasswordSchema,
  emailSchema,
  fieldErrorKeys,
  localizeFieldErrors,
  passwordChecks,
  passwordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/features/auth/schemas'
import {
  authErrorKey,
  isConfirmType,
  isSilentSignUpError,
  onboardingNext,
  postAuthRedirect,
} from '@/features/auth/errors'

const firstMessage = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.error?.issues[0]?.message

describe('passwordSchema', () => {
  it('accepts 8+ characters with a letter and a number', () => {
    expect(passwordSchema.safeParse('abcdefg1').success).toBe(true)
    expect(passwordSchema.safeParse('Пароль123').success).toBe(true) // non-Latin letters count
  })
  it('rejects short passwords', () => {
    expect(firstMessage(passwordSchema.safeParse('abc12'))).toBe('passwordTooShort')
  })
  it('requires a letter and a number', () => {
    expect(firstMessage(passwordSchema.safeParse('12345678'))).toBe('passwordNeedsLetter')
    expect(firstMessage(passwordSchema.safeParse('abcdefgh'))).toBe('passwordNeedsNumber')
  })
  it('rejects passwords longer than 72 characters (bcrypt limit)', () => {
    expect(firstMessage(passwordSchema.safeParse(`a1${'x'.repeat(71)}`))).toBe('passwordTooLong')
  })
  it('passwordChecks mirrors the schema for the live checklist', () => {
    expect(passwordChecks('abc')).toEqual({ length: false, letter: true, number: false })
    expect(passwordChecks('abcdefg1')).toEqual({ length: true, letter: true, number: true })
  })
})

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Aziz@Example.COM ')).toBe('aziz@example.com')
  })
  it('rejects invalid and empty emails', () => {
    expect(firstMessage(emailSchema.safeParse('not-an-email'))).toBe('emailInvalid')
    expect(firstMessage(emailSchema.safeParse(''))).toBe('emailRequired')
  })
})

describe('signUpSchema', () => {
  const valid = { fullName: 'Aziza Karimova', email: 'a@b.uz', password: 'secret123', acceptTerms: true, locale: 'uz' as const }
  it('accepts a complete registration', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true)
  })
  it('requires accepting the terms', () => {
    const r = signUpSchema.safeParse({ ...valid, acceptTerms: false })
    expect(r.success).toBe(false)
    expect(fieldErrorKeys(r.error!)).toEqual({ acceptTerms: ['acceptTermsRequired'] })
  })
  it('validates the name length (2–120)', () => {
    expect(fieldErrorKeys(signUpSchema.safeParse({ ...valid, fullName: ' A ' }).error!).fullName).toEqual(['nameTooShort'])
    expect(fieldErrorKeys(signUpSchema.safeParse({ ...valid, fullName: 'x'.repeat(121) }).error!).fullName).toEqual(['nameTooLong'])
  })
  it('only accepts UI locales', () => {
    expect(signUpSchema.safeParse({ ...valid, locale: 'ru' }).success).toBe(false)
  })
})

describe('signInSchema / reset / change password', () => {
  it('signIn only needs a non-empty password (no strength rules on login)', () => {
    expect(signInSchema.safeParse({ email: 'a@b.uz', password: 'x' }).success).toBe(true)
    expect(fieldErrorKeys(signInSchema.safeParse({ email: 'a@b.uz', password: '' }).error!)).toEqual({ password: ['passwordRequired'] })
  })
  it('reset requires matching passwords', () => {
    const r = resetPasswordSchema.safeParse({ password: 'secret123', confirmPassword: 'secret124' })
    expect(fieldErrorKeys(r.error!)).toEqual({ confirmPassword: ['passwordsDontMatch'] })
  })
  it('change password rejects reusing the current password', () => {
    const r = changePasswordSchema.safeParse({ currentPassword: 'secret123', newPassword: 'secret123', confirmPassword: 'secret123' })
    expect(fieldErrorKeys(r.error!)).toEqual({ newPassword: ['passwordSameAsCurrent'] })
  })
  it('localizes message keys and passes unknown ones through', () => {
    expect(localizeFieldErrors({ email: ['emailInvalid', 'custom'] }, { emailInvalid: 'Bad email' })).toEqual({ email: ['Bad email', 'custom'] })
  })
})

describe('authErrorKey', () => {
  it('maps Supabase errors to friendly keys', () => {
    expect(authErrorKey({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 })).toBe('invalidCredentials')
    expect(authErrorKey({ message: 'Invalid login credentials' })).toBe('invalidCredentials')
    expect(authErrorKey({ code: 'email_not_confirmed' })).toBe('emailNotConfirmed')
    expect(authErrorKey({ message: 'Email not confirmed' })).toBe('emailNotConfirmed')
    expect(authErrorKey({ status: 429, message: 'Too many' })).toBe('rateLimited')
    expect(authErrorKey({ code: 'over_email_send_rate_limit' })).toBe('rateLimited')
    expect(authErrorKey({ code: 'weak_password' })).toBe('weakPassword')
    expect(authErrorKey({ code: 'same_password' })).toBe('samePassword')
    expect(authErrorKey({ code: 'otp_expired' })).toBe('linkExpired')
    expect(authErrorKey({ code: 'something_else', message: 'boom' })).toBe('generic')
    expect(authErrorKey(null)).toBe('generic')
  })
  it('treats "already registered" as silent success (no account enumeration)', () => {
    expect(isSilentSignUpError({ code: 'user_already_exists' })).toBe(true)
    expect(isSilentSignUpError({ code: 'email_exists' })).toBe(true)
    expect(isSilentSignUpError({ code: 'weak_password' })).toBe(false)
  })
  it('accepts only known email OTP types', () => {
    expect(isConfirmType('recovery')).toBe(true)
    expect(isConfirmType('email')).toBe(true)
    expect(isConfirmType('admin')).toBe(false)
    expect(isConfirmType(null)).toBe(false)
  })
})

describe('redirect targets', () => {
  it('postAuthRedirect blocks open redirects and auth-page loops', () => {
    expect(postAuthRedirect('/dashboard/practice?subject=math')).toBe('/dashboard/practice?subject=math')
    expect(postAuthRedirect('https://evil.example')).toBe('/dashboard')
    expect(postAuthRedirect('//evil.example')).toBe('/dashboard')
    expect(postAuthRedirect('/\\evil.example')).toBe('/dashboard')
    expect(postAuthRedirect('/login?next=/x')).toBe('/dashboard')
    expect(postAuthRedirect('/auth/callback')).toBe('/dashboard')
    expect(postAuthRedirect('/api/student/profile')).toBe('/dashboard')
    expect(postAuthRedirect(undefined)).toBe('/dashboard')
  })
  it('onboardingNext only continues into the student app', () => {
    expect(onboardingNext('/dashboard/diagnostic')).toBe('/dashboard/diagnostic')
    expect(onboardingNext('/pricing')).toBe('/dashboard')
    expect(onboardingNext('/dashboard/onboarding')).toBe('/dashboard')
    expect(onboardingNext('/admin')).toBe('/dashboard')
    expect(onboardingNext('/dashboardx')).toBe('/dashboard')
  })
})
