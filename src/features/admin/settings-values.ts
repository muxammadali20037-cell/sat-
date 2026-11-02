import type { Json } from '@/types/database'

/**
 * platform_settings.value is jsonb. The editor keeps each row's JSON type stable: a number stays
 * a number, a boolean stays a boolean, and so on. Pure, unit-tested.
 */

export type SettingKind = 'number' | 'boolean' | 'string' | 'json'

export function settingKind(value: Json | undefined): SettingKind {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'string') return 'string'
  return 'json'
}

/** Value → the text shown in its input. */
export function settingToInput(value: Json | undefined): string {
  switch (settingKind(value)) {
    case 'number':
      return String(value)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'string':
      return value as string
    default:
      return JSON.stringify(value ?? null, null, 2)
  }
}

export type ParsedSetting = { ok: true; value: Json } | { ok: false; error: string }

/** Input text → JSON value of the requested kind, with a clear error when it does not fit. */
export function parseSettingInput(kind: SettingKind, input: string): ParsedSetting {
  switch (kind) {
    case 'number': {
      const t = input.trim()
      if (t === '') return { ok: false, error: 'Enter a number.' }
      if (!/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) return { ok: false, error: 'Enter a plain number such as 3 or 0.9.' }
      const n = Number(t)
      if (!Number.isFinite(n)) return { ok: false, error: 'Enter a finite number.' }
      return { ok: true, value: n }
    }
    case 'boolean': {
      const t = input.trim().toLowerCase()
      if (t === 'true') return { ok: true, value: true }
      if (t === 'false') return { ok: true, value: false }
      return { ok: false, error: 'Choose on or off.' }
    }
    case 'string':
      if (input.length > 2000) return { ok: false, error: 'Text values can be at most 2,000 characters.' }
      return { ok: true, value: input.trim() }
    case 'json': {
      if (input.length > 20000) return { ok: false, error: 'JSON values can be at most 20,000 characters.' }
      let parsed: unknown
      try {
        parsed = JSON.parse(input)
      } catch (err) {
        return { ok: false, error: `Invalid JSON: ${err instanceof Error ? err.message : 'could not parse'}.` }
      }
      if (parsed === null || typeof parsed !== 'object') {
        return { ok: false, error: 'This setting holds a JSON object or array.' }
      }
      return { ok: true, value: parsed as Json }
    }
  }
}

/**
 * Extra validation for known keys (beyond the JSON type). Unknown keys only get type checks.
 * Ranges follow how each setting is consumed by the platform.
 */
const KNOWN_RULES: Record<string, (v: Json) => string | null> = {
  'billing.grace_period_days': (v) => (isIntIn(v, 0, 30) ? null : 'Use a whole number of days between 0 and 30.'),
  'billing.renewal_reminder_days': (v) => (isIntIn(v, 0, 30) ? null : 'Use a whole number of days between 0 and 30.'),
  'practice.max_questions_per_session': (v) => (isIntIn(v, 1, 100) ? null : 'Use a whole number between 1 and 100.'),
  'exams.answer_grace_seconds': (v) => (isIntIn(v, 0, 60) ? null : 'Use a whole number of seconds between 0 and 60.'),
  'lessons.completion_ratio': (v) => (typeof v === 'number' && v > 0 && v <= 1 ? null : 'Use a ratio greater than 0 and at most 1 (e.g. 0.9).'),
  'ai.rate_limit_per_minute': (v) => (isIntIn(v, 1, 120) ? null : 'Use a whole number between 1 and 120.'),
  'contact.support_email': (v) =>
    typeof v === 'string' && (v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? null : 'Enter a valid email address, or leave empty to hide it.',
  'ai.pricing_usd_per_mtok': (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Use an object: { "model-id": { "input": 3, "output": 15 } }.'
    for (const [model, price] of Object.entries(v)) {
      if (!price || typeof price !== 'object' || Array.isArray(price)) return `"${model}" must be { "input": number, "output": number }.`
      const p = price as Record<string, unknown>
      if (typeof p.input !== 'number' || typeof p.output !== 'number' || p.input < 0 || p.output < 0) {
        return `"${model}" needs non-negative "input" and "output" prices (USD per million tokens).`
      }
    }
    return null
  },
}

function isIntIn(v: Json, min: number, max: number) {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

export function validateSettingValue(key: string, current: Json, input: string): ParsedSetting {
  const parsed = parseSettingInput(settingKind(current), input)
  if (!parsed.ok) return parsed
  const rule = KNOWN_RULES[key]
  const error = rule ? rule(parsed.value) : null
  return error ? { ok: false, error } : parsed
}
