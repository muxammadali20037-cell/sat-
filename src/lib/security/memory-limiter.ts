/**
 * In-memory fixed-window counter: the fallback used when the shared Postgres limiter is unreachable.
 *
 * It is per server instance, so it is looser than the shared limiter (each instance counts on its
 * own), but it keeps login, registration and SMS from becoming unlimited during a database outage.
 * Memory is bounded: expired windows are pruned, and when the table is full the oldest entries go.
 */

type Window = { count: number; resetAt: number }

export class MemoryLimiter {
  private windows = new Map<string, Window>()

  constructor(private readonly maxKeys = 10_000) {}

  hit(key: string, limit: number, windowSec: number, now = Date.now()): { allowed: boolean; remaining: number; resetAt: string } {
    let w = this.windows.get(key)
    if (!w || w.resetAt <= now) {
      this.prune(now)
      w = { count: 0, resetAt: now + windowSec * 1000 }
      this.windows.set(key, w)
    }
    w.count += 1
    return { allowed: w.count <= limit, remaining: Math.max(0, limit - w.count), resetAt: new Date(w.resetAt).toISOString() }
  }

  get size(): number {
    return this.windows.size
  }

  private prune(now: number) {
    if (this.windows.size < this.maxKeys) return
    for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k)
    // Still full: drop the oldest insertions (Map keeps insertion order).
    while (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value
      if (oldest === undefined) break
      this.windows.delete(oldest)
    }
  }
}
