import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { serverEnv, siteUrl } from '@/lib/env'
import { callBot, botToken } from '@/lib/telegram/bot'
import { BOT_COPY, botLocale } from '@/features/telegram/bot-copy'
import { MINI_APP_PATH } from '@/features/telegram/shared'
import { LOGIN_COPY } from '@/features/telegram/login-shared'
import { handleLoginCallback, handleLoginStart, handlePhoneSkip, handleSharedContact } from '@/features/telegram/login'

/**
 * POST /api/webhooks/telegram — bot updates. Telegram echoes the secret set with setWebhook in
 * X-Telegram-Bot-Api-Secret-Token; anything without it is rejected. In private chats the bot:
 * - /start, /app, /help → a button that opens the Mini App;
 * - /start login_<token> → website sign-in confirmation (see features/telegram/login.ts);
 * - "Confirm"/"Cancel" buttons (callback queries) for that confirmation;
 * - a shared contact → saves the student's own phone number.
 * Always 200 for accepted updates, so Telegram does not retry a reply that failed on our side.
 */

type From = { id: number; is_bot?: boolean; first_name: string; last_name?: string; username?: string; language_code?: string }
type Update = {
  update_id: number
  message?: { chat: { id: number; type: string }; from?: From; text?: string; contact?: { phone_number: string; user_id?: number } }
  callback_query?: { id: string; from: From; data?: string; message?: { chat: { id: number }; message_id: number } }
}

const COMMANDS = new Set(['/start', '/app', '/help'])

function secretMatches(given: string | null, expected: string): boolean {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handle(update: Update) {
  if (update.callback_query) {
    await handleLoginCallback(update.callback_query)
    return
  }
  const message = update.message
  if (!message || message.chat.type !== 'private' || !message.from || message.from.is_bot) return
  const from = message.from

  if (message.contact) {
    await handleSharedContact(message.chat.id, from, message.contact)
    return
  }
  const text = message.text?.trim() ?? ''
  const [rawCommand, payload] = text.split(/\s+/, 2)
  const command = rawCommand?.split('@')[0]?.toLowerCase()

  if (command === '/start' && payload?.startsWith('login_')) {
    await handleLoginStart(message.chat.id, from, payload.slice('login_'.length))
    return
  }
  const skip = LOGIN_COPY[botLocale(from.language_code)].phoneSkip
  if (text === skip || text === LOGIN_COPY.uz.phoneSkip || text === LOGIN_COPY.en.phoneSkip) {
    await handlePhoneSkip(message.chat.id, from)
    return
  }
  if (command && COMMANDS.has(command)) {
    const t = BOT_COPY[botLocale(from.language_code)]
    await callBot('sendMessage', {
      chat_id: message.chat.id,
      text: t.welcome,
      reply_markup: { inline_keyboard: [[{ text: t.openButton, web_app: { url: siteUrl(MINI_APP_PATH) } }]] },
    })
  }
}

export async function POST(request: Request) {
  const secret = serverEnv().TELEGRAM_WEBHOOK_SECRET
  if (!secret || !botToken()) return NextResponse.json({ ok: false }, { status: 404 })
  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  const update = (await request.json().catch(() => null)) as Update | null
  if (update) {
    try {
      await handle(update)
    } catch (err) {
      console.error('[telegram] update failed', update.update_id, err)
    }
  }
  return NextResponse.json({ ok: true })
}
