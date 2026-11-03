/** Uzbekistan phone numbers for SMS sign-in (pure; shared by the form and the server). */

/** "+998 90 123-45-67", "998901234567", "90 123 45 67" → "+998901234567"; anything else → null. */
export function normalizeUzPhone(input: string): string | null {
  let digits = (input ?? '').replace(/\D/g, '')
  if (digits.length === 9) digits = `998${digits}`
  return /^998\d{9}$/.test(digits) ? `+${digits}` : null
}

/** "+998901234567" → "+998 90 123 45 67" */
export function formatUzPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone)
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone
}
