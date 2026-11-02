import { addDays, localDate } from '@/lib/time'

/**
 * Pure bucketing helpers for admin charts (unit-tested). All buckets are computed in the
 * business time zone so "this month" means the same thing to every admin.
 */

export const BUSINESS_TZ = 'Asia/Tashkent'

export type Granularity = 'day' | 'week' | 'month'

export type SeriesPoint = { key: string; label: string; fullLabel: string; value: number }

export type RevenuePeriod = 'year' | '6m' | '30d'
export const REVENUE_PERIODS: ReadonlyArray<{ value: RevenuePeriod; label: string }> = [
  { value: 'year', label: 'This year' },
  { value: '6m', label: 'Last 6 months' },
  { value: '30d', label: 'Last 30 days' },
]
export function isRevenuePeriod(v: unknown): v is RevenuePeriod {
  return v === 'year' || v === '6m' || v === '30d'
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Timestamp or date → YYYY-MM-DD in the zone (date-only values are already local). */
export function toLocalDateKey(value: string | Date, tz: string = BUSINESS_TZ): string {
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value
  return localDate(tz, typeof value === 'string' ? new Date(value) : value)
}

export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

export function bucketKey(value: string | Date, g: Granularity, tz: string = BUSINESS_TZ): string {
  const d = toLocalDateKey(value, tz)
  if (g === 'day') return d
  if (g === 'week') return mondayOf(d)
  return d.slice(0, 7)
}

function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number) as [number, number]
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** The last `count` bucket keys ending with the bucket that contains `now`. */
export function lastBuckets(g: Granularity, count: number, now: Date = new Date(), tz: string = BUSINESS_TZ): string[] {
  const end = bucketKey(now, g, tz)
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    if (g === 'day') keys.push(addDays(end, -i))
    else if (g === 'week') keys.push(addDays(end, -7 * i))
    else keys.push(addMonths(end, -i))
  }
  return keys
}

/** First calendar day (YYYY-MM-DD) of a bucket key. */
export function bucketStartDate(key: string): string {
  return key.length === 7 ? `${key}-01` : key
}

/**
 * UTC instant of local midnight at the start of `date` in the zone. Uses the zone's offset at
 * noon UTC that day (no DST in Asia/Tashkent; good enough for other zones' bucket filters).
 */
export function localMidnightIso(date: string, tz: string = BUSINESS_TZ): string {
  const noon = new Date(`${date}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(noon)
  const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name)
  const offset = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - offset * 60_000).toISOString()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function bucketLabels(key: string, g: Granularity): { label: string; fullLabel: string } {
  if (g === 'month') {
    const [y, m] = key.split('-').map(Number) as [number, number]
    return { label: MONTHS[m - 1]!, fullLabel: `${MONTHS_LONG[m - 1]} ${y}` }
  }
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  const short = `${d} ${MONTHS[m - 1]}`
  return { label: short, fullLabel: g === 'week' ? `Week of ${short} ${y}` : `${short} ${y}` }
}

/** Sum `valueOf(row)` into the given buckets; rows outside the buckets are ignored. */
export function aggregate<T>(
  rows: readonly T[],
  keys: readonly string[],
  g: Granularity,
  dateOf: (row: T) => string | null | undefined,
  valueOf: (row: T) => number = () => 1,
  tz: string = BUSINESS_TZ,
): SeriesPoint[] {
  const totals = new Map(keys.map((k) => [k, 0]))
  for (const row of rows) {
    const at = dateOf(row)
    if (!at) continue
    const k = bucketKey(at, g, tz)
    if (totals.has(k)) totals.set(k, totals.get(k)! + valueOf(row))
  }
  return keys.map((key) => ({ key, ...bucketLabels(key, g), value: totals.get(key)! }))
}

/** Distinct `idOf(row)` per bucket (e.g. active students per week). */
export function distinctPerBucket<T>(
  rows: readonly T[],
  keys: readonly string[],
  g: Granularity,
  dateOf: (row: T) => string | null | undefined,
  idOf: (row: T) => string,
  tz: string = BUSINESS_TZ,
): SeriesPoint[] {
  const sets = new Map(keys.map((k) => [k, new Set<string>()]))
  for (const row of rows) {
    const at = dateOf(row)
    if (!at) continue
    sets.get(bucketKey(at, g, tz))?.add(idOf(row))
  }
  return keys.map((key) => ({ key, ...bucketLabels(key, g), value: sets.get(key)!.size }))
}

export type RevenueWindow = { period: RevenuePeriod; granularity: Granularity; keys: string[]; startIso: string }

export function revenueWindow(period: RevenuePeriod, now: Date = new Date(), tz: string = BUSINESS_TZ): RevenueWindow {
  let granularity: Granularity
  let keys: string[]
  if (period === '30d') {
    granularity = 'day'
    keys = lastBuckets('day', 30, now, tz)
  } else if (period === '6m') {
    granularity = 'month'
    keys = lastBuckets('month', 6, now, tz)
  } else {
    granularity = 'month'
    const current = bucketKey(now, 'month', tz)
    const months = Number(current.slice(5, 7))
    keys = lastBuckets('month', months, now, tz)
  }
  return { period, granularity, keys, startIso: localMidnightIso(bucketStartDate(keys[0]!), tz) }
}

export type MoneyRow = { at: string | null; amountMinor: number; currency: string }
export type CurrencySeries = { currency: string; totalMinor: number; count: number; points: SeriesPoint[] }

/**
 * Revenue per currency — currencies are NEVER added together. UZS first, then alphabetical.
 * Only pass rows of payments that actually succeeded.
 */
export function revenueByCurrency(rows: readonly MoneyRow[], keys: readonly string[], g: Granularity, tz: string = BUSINESS_TZ): CurrencySeries[] {
  const currencies = [...new Set(rows.map((r) => r.currency))].sort((a, b) => (a === 'UZS' ? -1 : b === 'UZS' ? 1 : a.localeCompare(b)))
  const keySet = new Set(keys)
  return currencies.map((currency) => {
    const own = rows.filter((r) => r.currency === currency && r.at && keySet.has(bucketKey(r.at, g, tz)))
    const points = aggregate(own, keys, g, (r) => r.at, (r) => r.amountMinor, tz)
    return { currency, totalMinor: points.reduce((s, p) => s + p.value, 0), count: own.length, points }
  })
}

export function seriesTotal(points: readonly SeriesPoint[]): number {
  return points.reduce((s, p) => s + p.value, 0)
}

/** Group-and-count helper for distributions (plans, levels, statuses). Keeps the given order. */
export function countBy<T>(rows: readonly T[], keyOf: (row: T) => string, order: readonly string[] = []): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>(order.map((k) => [k, 0]))
  for (const row of rows) {
    const k = keyOf(row)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }))
}
