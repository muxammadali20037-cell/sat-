import type { Locale } from './config'

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

/**
 * A feature dictionary. `uz` must have every key `en` has (type-checked); `ru` is optional
 * and falls back to English key by key.
 *
 *   export const practiceDict = defineDict({ en: { start: 'Start practice' }, uz: { start: 'Mashqni boshlash' } })
 */
export type Dict<T> = { en: T; uz: T; ru?: DeepPartial<T> }

export function defineDict<T extends Record<string, unknown>>(dict: {
  en: T
  uz: NoInfer<T>
  ru?: NoInfer<DeepPartial<T>>
}): Dict<T> {
  return dict
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object') return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = b && typeof b === 'object' && v && typeof v === 'object' ? deepMerge(b, v) : (v ?? b)
  }
  return out as T
}

export function resolveDict<T>(dict: Dict<T>, locale: Locale): T {
  if (locale === 'uz') return dict.uz
  if (locale === 'ru') return dict.ru ? deepMerge(dict.en, dict.ru) : dict.en
  return dict.en
}

/** format('Welcome back, {name}', { name: 'Aziz' }) */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in values ? String(values[key]) : `{${key}}`))
}

/** plural(3, { one: '{n} question', other: '{n} questions' }) */
export function plural(n: number, forms: { one: string; other: string }): string {
  return format(n === 1 ? forms.one : forms.other, { n })
}
