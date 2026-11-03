/**
 * One malformed server setting must not break every page (3 Nov incident: an invalid
 * TELEGRAM_WEBHOOK_SECRET made serverEnv() throw on login, register and the dashboard).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
  vi.resetModules()
  vi.restoreAllMocks()
})

async function freshEnv() {
  vi.resetModules()
  return import('@/lib/env')
}

describe('serverEnv', () => {
  it('ignores an invalid optional value, keeps the rest and reports it without the value', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.TELEGRAM_WEBHOOK_SECRET = 'short!'
    process.env.TELEGRAM_BOT_TOKEN = '1234567890:AAH-test_token_for_unit_tests_only'
    process.env.ESKIZ_FROM = '4546'
    const env = await freshEnv()
    const s = env.serverEnv()
    expect(s.TELEGRAM_WEBHOOK_SECRET).toBeUndefined()
    expect(s.TELEGRAM_BOT_TOKEN).toBe('1234567890:AAH-test_token_for_unit_tests_only')
    expect(env.serverEnvProblems()).toEqual([{ key: 'TELEGRAM_WEBHOOK_SECRET', message: expect.stringContaining('16–256') }])
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0]![0])).not.toContain('short!')
  })

  it('an invalid value with a default falls back to the default', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.AI_PROVIDER = 'something-else'
    const env = await freshEnv()
    expect(env.serverEnv().AI_PROVIDER).toBe('anthropic')
    expect(env.serverEnvProblems().map((p) => p.key)).toEqual(['AI_PROVIDER'])
  })

  it('reports nothing when every value is valid', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = 'a'.repeat(32)
    const env = await freshEnv()
    expect(env.serverEnv().TELEGRAM_WEBHOOK_SECRET).toBe('a'.repeat(32))
    expect(env.serverEnvProblems()).toEqual([])
  })
})
