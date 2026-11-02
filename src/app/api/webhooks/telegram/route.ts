import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { serverEnv, siteUrl } from '@/lib/env'
import { callBot, botToken } from '@/lib/telegram/bot'
import { BOT_COPY, botLocale } from '@/features/telegram/bot-copy'
import { MINI_APP_PATH } from '@/features/telegram/shared'

/**
 * POST /api/webhooks/telegram — bot updates. Telegram echoes the secret set with setWebhook in
 * X-Telegram-Bot-Api-Secret-Token; anything without it is rejected. The bot only answers commands
 * in private chats with a button that opens the Mini App. Always 200 for accepted updates, so
 * Telegram does not retry a reply that failed on our side.
 */

type Update = {
  update_id: number
  message?: { chat: { id: number; type: string }; from?: { language_code?: string; is_bot?: boolean }; text?: string }
}

const COMMANDS = new Set(['/start', '/app', '/help'])

function secretMatches(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = serverEnv().TELEGRAM_WEBHOOK_SECRET
  if (!secret || !botToken()) return NextResponse.json({ ok: false }, { status: 404 })
  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const update = (await request.json().catch(() => null)) as Update | null
  const message = update?.message
  const command = message?.text?.trim().split(/\s+/)[0]?.split('@')[0]?.toLowerCase()
  if (message && message.chat.type === 'private' && !message.from?.is_bot && command && COMMANDS.has(command)) {
    const t = BOT_COPY[botLocale(message.from?.language_code)]
    try {
      await callBot('sendMessage', {
        chat_id: message.chat.id,
        text: t.welcome,
        reply_markup: { inline_keyboard: [[{ text: t.openButton, web_app: { url: siteUrl(MINI_APP_PATH) } }]] },
      })
    } catch (err) {
      console.error('[telegram] could not reply to', command, err)
    }
  }
  return NextResponse.json({ ok: true })
}
