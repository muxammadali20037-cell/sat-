import { formatMoney } from '@/lib/utils'
import { BUSINESS_TZ } from './series'
import { richTextExcerpt } from '@/lib/rich-text/tokenize'

/** Admin display formatting (pure). Dates render in the business time zone. */

export function formatDate(iso: string | null | undefined, tz: string = BUSINESS_TZ): string {
  if (!iso) return '—'
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

export function formatDateTime(iso: string | null | undefined, tz: string = BUSINESS_TZ): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

export function timeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never'
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} d ago`
  return formatDate(iso)
}

/** USD micro-units (millionths) → "$1.23" */
export function formatUsdMicros(micros: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(micros / 1_000_000)
}

/** Compact money for chart axes: 12 500 000 UZS (minor) → "125K". */
export function compactMajor(amountMinor: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(amountMinor / 100)
}

export function money(amountMinor: number, currency: string): string {
  return formatMoney(amountMinor, currency, 'en')
}

/** Plain-text excerpt of authored rich text (drops $…$ delimiters and emphasis markers). */
export function excerpt(source: string, max = 120): string {
  // Same plain-text rendering students see in lists: math as readable text, escaped \$ as $.
  return richTextExcerpt(source ?? '', max)
}
