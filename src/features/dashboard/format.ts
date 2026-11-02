/** Locale-aware display helpers shared by the dashboard, courses, lessons and analytics. Client-safe. */

export type DurationUnits = { h: string; min: string; s: string }

export function intlLocale(locale: string): string {
  if (locale === 'uz') return 'uz-Latn-UZ'
  if (locale === 'ru') return 'ru-RU'
  return 'en-US'
}

/** 3725 → "1 h 2 min", 2700 → "45 min", 40 → "40 s" (units from the feature dictionary). */
export function formatStudyDuration(totalSeconds: number, units: DurationUnits): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return m > 0 ? `${h} ${units.h} ${m} ${units.min}` : `${h} ${units.h}`
  if (m > 0) return `${m} ${units.min}`
  return `${s} ${units.s}`
}

/** Lesson length, rounded up to whole minutes ("12 min"); under a minute shows seconds. */
export function formatLessonLength(totalSeconds: number, units: DurationUnits): string {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} ${units.s}`
  const minutes = Math.ceil(s / 60)
  if (minutes < 60) return `${minutes} ${units.min}`
  return formatStudyDuration(minutes * 60, units)
}

/** 272 → "4:32", 3725 → "1:02:05". */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function formatDate(iso: string, locale: string, timeZone: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), { ...options, timeZone: iso.length === 10 ? 'UTC' : timeZone }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

export function formatInteger(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value)
}

export function percent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  return `${Math.round(ratio * 100)}%`
}
