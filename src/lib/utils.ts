import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format minor units (tiyin/cents) as a localized currency string. */
export function formatMoney(amountMinor: number, currency: string, locale = 'en'): string {
  const major = amountMinor / 100
  const intlLocale = locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US'
  if (currency === 'UZS') {
    return `${new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 }).format(major)} UZS`
  }
  return new Intl.NumberFormat(intlLocale, { style: 'currency', currency }).format(major)
}

export function formatNumber(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale === 'uz' ? 'uz-UZ' : locale === 'ru' ? 'ru-RU' : 'en-US').format(value)
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

/** 3725 → "1h 2m", 95 → "1m 35s" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return sec > 0 && m < 10 ? `${m}m ${sec}s` : `${m}m`
  return `${sec}s`
}

/** Countdown display: 1925 → "32:05", 3725 → "1:02:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** Only allow same-origin relative redirect targets (prevents open redirects). */
export function safeRedirectPath(input: string | null | undefined, fallback = '/dashboard'): string {
  if (!input) return fallback
  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) return fallback
  return input
}

/** Today's date (YYYY-MM-DD) in a given IANA time zone. */
export function todayInTimeZone(timeZone = 'Asia/Tashkent', now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}
