import { z } from 'zod'

/**
 * Auth form schemas, shared by the client forms (React Hook Form) and the server actions.
 * Messages are keys into `authDict.errors` so both sides can localize them.
 */

export const PASSWORD_MIN_LENGTH = 8
/** bcrypt (Supabase Auth) ignores bytes after 72. */
export const PASSWORD_MAX_LENGTH = 72

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'emailRequired')
  .max(254, 'emailInvalid')
  .pipe(z.email('emailInvalid'))

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'passwordTooShort')
  .max(PASSWORD_MAX_LENGTH, 'passwordTooLong')
  .regex(/\p{L}/u, 'passwordNeedsLetter')
  .regex(/\d/, 'passwordNeedsNumber')

export const fullNameSchema = z.string().trim().min(2, 'nameTooShort').max(120, 'nameTooLong')

export const uiLocaleSchema = z.enum(['en', 'uz'])

export const signUpSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.boolean().refine((v) => v === true, 'acceptTermsRequired'),
  locale: uiLocaleSchema,
  next: z.string().max(500).optional(),
})
export type SignUpInput = z.input<typeof signUpSchema>

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'passwordRequired').max(200, 'passwordTooLong'),
  next: z.string().max(500).optional(),
})
export type SignInInput = z.input<typeof signInSchema>

export const emailOnlySchema = z.object({ email: emailSchema })
export type EmailOnlyInput = z.input<typeof emailOnlySchema>

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string().min(1, 'confirmRequired') })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'passwordsDontMatch' })
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'passwordRequired').max(200, 'passwordTooLong'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'confirmRequired'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'passwordsDontMatch' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'passwordSameAsCurrent' })
export type ChangePasswordInput = z.input<typeof changePasswordSchema>

/** Live checklist shown under a new-password field. */
export function passwordChecks(password: string): { length: boolean; letter: boolean; number: boolean } {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    letter: /\p{L}/u.test(password),
    number: /\d/.test(password),
  }
}

/** Zod error → `{ field: [messageKey] }` (first-level paths only, which is all our forms use). */
export function fieldErrorKeys(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form')
    ;(out[key] ??= []).push(issue.message)
  }
  return out
}

/** Translate message keys with a dictionary; unknown keys pass through unchanged. */
export function localizeFieldErrors(
  errors: Record<string, string[]>,
  messages: Record<string, string>,
): Record<string, string[]> {
  return Object.fromEntries(Object.entries(errors).map(([k, list]) => [k, list.map((m) => messages[m] ?? m)]))
}
