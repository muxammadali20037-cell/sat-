/**
 * Invitation codes: 8 characters from an alphabet without look-alikes (no 0/O, 1/I), shown as
 * XXXX-XXXX and used in the join link and its QR code. ~8.5 × 10^11 combinations; joining is
 * rate-limited per user and per IP.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8

export function generateCode(randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // 256 is a multiple of 32, so `byte % 32` is uniform.
  const bytes = randomBytes(CODE_LENGTH)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** "abcd-efgh", " ABCD EFGH " → "ABCDEFGH"; null when it cannot be a code. */
export function normalizeCode(input: string | null | undefined): string | null {
  const s = (input ?? '').toUpperCase().replace(/[\s-]/g, '')
  return /^[A-HJ-NP-Z2-9]{8}$/.test(s) ? s : null
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`
