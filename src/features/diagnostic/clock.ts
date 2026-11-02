/**
 * Server-synced countdown — pure (unit-tested). The browser clock may be wrong, so the client
 * keeps an offset `serverNow − clientNow` measured on every server response and derives the
 * remaining time from the server's deadline. The server enforces the deadline regardless.
 */

/** Offset to add to the client clock to approximate the server clock (ms). */
export function clockOffsetMs(serverNowIso: string, clientNowMs: number, roundTripMs = 0): number {
  const server = new Date(serverNowIso).getTime()
  if (!Number.isFinite(server)) return 0
  // The server stamped its time roughly half-way through the round trip.
  return server + Math.max(0, roundTripMs) / 2 - clientNowMs
}

/** Whole seconds left until the deadline (0 when passed, null when there is no deadline). */
export function remainingSeconds(deadlineIso: string | null, offsetMs: number, clientNowMs: number): number | null {
  if (!deadlineIso) return null
  const deadline = new Date(deadlineIso).getTime()
  if (!Number.isFinite(deadline)) return null
  return Math.max(0, Math.ceil((deadline - (clientNowMs + offsetMs)) / 1000))
}

/** Announce thresholds crossed between two readings (5 and 1 minute marks). */
export function crossedWarnings(previous: number | null, current: number | null): Array<300 | 60> {
  if (previous === null || current === null) return []
  const out: Array<300 | 60> = []
  for (const mark of [300, 60] as const) {
    if (previous > mark && current <= mark && current > 0) out.push(mark)
  }
  return out
}

/** Whole seconds from `now` until `deadlineIso` (server-side, e.g. "time left" on the list page). */
export function secondsUntil(deadlineIso: string | null, now: Date = new Date()): number | null {
  return remainingSeconds(deadlineIso, 0, now.getTime())
}
