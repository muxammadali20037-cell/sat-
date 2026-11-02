import type { z } from 'zod'

/**
 * Zod issues → `{ 'options.0.content': ['…'] }`. Unlike z.flattenError this keeps nested
 * paths, so editors can show an error next to the exact field. Pure and client-safe.
 */
export function issuesToFieldErrors(issues: readonly z.ZodError['issues'][number][]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const issue of issues) {
    const key = issue.path.map(String).join('.') || '_form'
    const list = (out[key] ??= [])
    if (!list.includes(issue.message)) list.push(issue.message)
  }
  return out
}

export function firstFieldError(errors: Record<string, string[]> | undefined, key: string): string | undefined {
  return errors?.[key]?.[0]
}

/** One-line summary for a toast when several fields are invalid. */
export function summarizeFieldErrors(errors: Record<string, string[]>): string {
  const keys = Object.keys(errors)
  if (keys.length === 0) return 'Some fields are invalid.'
  const first = errors[keys[0]!]![0]!
  return keys.length === 1 ? first : `${first} (and ${keys.length - 1} more)`
}
