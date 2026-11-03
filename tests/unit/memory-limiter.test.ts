/**
 * Fallback rate limiter used when the shared Postgres limiter is unreachable (S3 in SECURITY_MODEL.md):
 * the same rules still apply per instance instead of failing open.
 */
import { describe, expect, it } from 'vitest'
import { MemoryLimiter } from '@/lib/security/memory-limiter'

describe('MemoryLimiter', () => {
  it('allows up to the limit inside a window, then blocks', () => {
    const m = new MemoryLimiter()
    const now = 1_000_000
    const results = Array.from({ length: 6 }, () => m.hit('auth-register:1.2.3.4', 5, 3600, now))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, true, true, false])
    expect(results[4]!.remaining).toBe(0)
    expect(results[5]!.resetAt).toBe(new Date(now + 3600_000).toISOString())
  })

  it('keeps keys apart and starts a new window after reset', () => {
    const m = new MemoryLimiter()
    const now = 5_000_000
    for (let i = 0; i < 3; i++) m.hit('a', 2, 60, now)
    expect(m.hit('a', 2, 60, now).allowed).toBe(false)
    expect(m.hit('b', 2, 60, now).allowed).toBe(true)
    expect(m.hit('a', 2, 60, now + 60_000).allowed).toBe(true)
  })

  it('stays bounded in memory', () => {
    const m = new MemoryLimiter(100)
    for (let i = 0; i < 1000; i++) m.hit(`k${i}`, 5, 60, 0)
    expect(m.size).toBeLessThanOrEqual(100)
    // The newest key is still counted.
    expect(m.hit('k999', 1, 60, 0).allowed).toBe(false)
  })
})
