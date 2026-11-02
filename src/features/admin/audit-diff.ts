import type { Json } from '@/types/database'

/**
 * Field-level diff of audit before/after snapshots (pure, unit-tested). Timestamps that change
 * on every write are listed last so the meaningful change reads first.
 */

export type DiffEntry = { key: string; before: Json | undefined; after: Json | undefined; change: 'added' | 'removed' | 'changed' | 'same' }

const NOISY = new Set(['updated_at', 'created_at'])

function isObject(v: unknown): v is Record<string, Json | undefined> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function stableStringify(v: Json | undefined): string {
  if (v === undefined) return ''
  if (isObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`
  }
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`
  return JSON.stringify(v)
}

export function diffJson(before: Json | null | undefined, after: Json | null | undefined, opts: { includeSame?: boolean } = {}): DiffEntry[] {
  const b = isObject(before) ? before : before === null || before === undefined ? {} : { value: before }
  const a = isObject(after) ? after : after === null || after === undefined ? {} : { value: after }
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])]
  const entries: DiffEntry[] = []
  for (const key of keys) {
    const inB = key in b
    const inA = key in a
    const change: DiffEntry['change'] = !inB ? 'added' : !inA ? 'removed' : stableStringify(b[key]) === stableStringify(a[key]) ? 'same' : 'changed'
    if (change === 'same' && !opts.includeSame) continue
    entries.push({ key, before: b[key], after: a[key], change })
  }
  return entries.sort((x, y) => Number(NOISY.has(x.key)) - Number(NOISY.has(y.key)) || x.key.localeCompare(y.key))
}

/** Compact display of a JSON value inside a diff cell. */
export function formatDiffValue(v: Json | undefined, max = 400): string {
  if (v === undefined) return '—'
  if (v === null) return 'null'
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
