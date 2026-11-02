import 'server-only'
import { serverEnv } from '@/lib/env'

/** Minimal Telegram Bot API client (server only — the token never reaches the browser). */

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly errorCode: number | null,
    description: string,
  ) {
    super(`Telegram ${method} failed: ${description}`)
    this.name = 'TelegramApiError'
  }
}

export function botToken(): string | null {
  return serverEnv().TELEGRAM_BOT_TOKEN ?? null
}

export const isTelegramConfigured = () => Boolean(botToken())

export async function callBot<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
  const token = botToken()
  if (!token) throw new TelegramApiError(method, null, 'TELEGRAM_BOT_TOKEN is not set')
  let res: Response
  try {
    res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
  } catch (err) {
    throw new TelegramApiError(method, null, err instanceof Error ? err.message : 'network error')
  }
  const json = (await res.json().catch(() => null)) as { ok: boolean; result?: T; error_code?: number; description?: string } | null
  if (!json?.ok) throw new TelegramApiError(method, json?.error_code ?? res.status, json?.description ?? `HTTP ${res.status}`)
  return json.result as T
}
