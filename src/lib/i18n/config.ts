export const LOCALES = ['en', 'uz', 'ru'] as const
/** Accepted by the database and types; dictionaries are optional until translated. */
export const ALL_LOCALES = ['en', 'uz', 'ru'] as const
export type Locale = (typeof ALL_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'sm_locale'

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  uz: "O'zbekcha",
  ru: 'Русский',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (ALL_LOCALES as readonly string[]).includes(value)
}

/** Locales offered in the UI (those with dictionaries). */
export function isUiLocale(value: unknown): value is (typeof LOCALES)[number] {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
