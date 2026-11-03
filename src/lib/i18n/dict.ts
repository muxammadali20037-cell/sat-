import type { Locale } from './config'

/** Plural forms: English and Uzbek need one/other; Russian also uses few/many (CLDR). */
export type PluralForms = { one: string; other: string; few?: string; many?: string }

/** A locale's copy of `T` where every {one, other} object may also carry few/many. */
export type WithPlurals<T> = T extends { one: string; other: string }
  ? T & { few?: string; many?: string }
  : T extends string
    ? T
    : T extends readonly (infer U)[]
      ? readonly WithPlurals<U>[]
      : T extends object
        ? { [K in keyof T]: WithPlurals<T[K]> }
        : T

/**
 * A feature dictionary. `uz` and `ru` must have every key `en` has (type-checked; Russian plural
 * objects may add few/many). At runtime Russian is still merged over English, so a partial copy
 * from elsewhere can never blank out the interface.
 *
 *   export const practiceDict = defineDict({
 *     en: { start: 'Start practice' }, uz: { start: 'Mashqni boshlash' }, ru: { start: 'Начать практику' },
 *   })
 */
export type Dict<T> = { en: T; uz: T; ru: WithPlurals<T> }

export function defineDict<T extends Record<string, unknown>>(dict: {
  en: T
  uz: NoInfer<T>
  ru: NoInfer<WithPlurals<T>>
}): Dict<T> {
  return dict
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== 'object') return base
  // A translated list replaces the base list whole (merging would turn it into an object).
  if (Array.isArray(override) || Array.isArray(base)) return (Array.isArray(override) ? override : base) as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    const b = (base as Record<string, unknown>)[k]
    out[k] = b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(b, v) : (v ?? b)
  }
  return out as T
}

export function resolveDict<T>(dict: Dict<T>, locale: Locale): T {
  if (locale === 'uz') return dict.uz
  if (locale === 'ru') return deepMerge(dict.en, dict.ru as unknown)
  return dict.en
}

/** format('Welcome back, {name}', { name: 'Aziz' }) */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (key in values ? String(values[key]) : `{${key}}`))
}

const ruRules = new Intl.PluralRules('ru')

/**
 * plural(3, { one: '{n} question', other: '{n} questions' })
 * Russian copies add few/many: { one: '{n} вопрос', few: '{n} вопроса', many: '{n} вопросов', other: '{n} вопроса' }
 * (selected with CLDR rules: 1, 21 → one; 2–4, 22–24 → few; 0, 5–20, 25 → many; fractions → other).
 */
export function plural(n: number, forms: PluralForms): string {
  const f = forms as PluralForms
  if (f.few !== undefined || f.many !== undefined) {
    const cat = ruRules.select(n)
    const t = cat === 'one' ? f.one : cat === 'few' ? (f.few ?? f.other) : cat === 'many' ? (f.many ?? f.other) : f.other
    return format(t, { n })
  }
  return format(n === 1 ? f.one : f.other, { n })
}
