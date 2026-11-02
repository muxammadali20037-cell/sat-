/** Search-param helpers for admin list pages (pure, unit-tested). */

/** Characters allowed in free-text admin search (keeps PostgREST filter syntax safe). */
export function sanitizeSearch(q: string | null | undefined, max = 80): string {
  return (q ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}@.+\-' ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

export function pageFromParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v)
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1
}

export function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

export function oneOf<T extends string>(v: string | string[] | undefined, allowed: readonly T[], fallback: T): T
export function oneOf<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | ''
export function oneOf<T extends string>(v: string | string[] | undefined, allowed: readonly T[], fallback?: T): T | '' {
  const s = param(v)
  return (allowed as readonly string[]).includes(s) ? (s as T) : (fallback ?? '')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function uuidParam(v: string | string[] | undefined): string {
  const s = param(v)
  return UUID_RE.test(s) ? s : ''
}
export function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}

/** YYYY-MM-DD or '' */
export function dateParam(v: string | string[] | undefined): string {
  const s = param(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) ? s : ''
}

/** Build a URL for list pages, dropping empty values (and page=1). */
export function buildHref(path: string, params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    if (k === 'page' && Number(v) === 1) continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${path}?${qs}` : path
}
