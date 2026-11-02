/** Time-zone helpers (no external deps). Students default to Asia/Tashkent. */

function offsetMinutes(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at)
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name)
    if (!m) return 0
    const sign = m[1] === '-' ? -1 : 1
    return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0))
  } catch {
    return 0
  }
}

/** YYYY-MM-DD for `at` in the given zone. */
export function localDate(timeZone: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

/** UTC instant of local midnight (start of today) in the zone. */
export function startOfLocalDay(timeZone: string, at = new Date()): Date {
  const date = localDate(timeZone, at)
  const utcMidnight = new Date(`${date}T00:00:00Z`)
  return new Date(utcMidnight.getTime() - offsetMinutes(timeZone, at) * 60_000)
}

/** UTC instant of the first day of the current local month. */
export function startOfLocalMonth(timeZone: string, at = new Date()): Date {
  const date = localDate(timeZone, at)
  const first = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
  return new Date(first.getTime() - offsetMinutes(timeZone, at) * 60_000)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((new Date(`${toDate}T00:00:00Z`).getTime() - new Date(`${fromDate}T00:00:00Z`).getTime()) / 86_400_000)
}
