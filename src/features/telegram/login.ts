import 'server-only'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { cookies } from 'next/headers'
import { ApiError } from '@/lib/api/errors'
import { isProduction } from '@/lib/env'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/auth/session'
import { callBot } from '@/lib/telegram/bot'
import type { TelegramUser } from '@/lib/telegram/init-data'
import { postAuthRedirect } from '@/features/auth/errors'
import { botLocale } from './bot-copy'
import { connectTelegramUser, openSessionFor, resolveTelegramAccount } from './server'
import { LOGIN_COPY, clientHint, normalizePhone } from './login-shared'

/**
 * Website sign-in with Telegram (no password):
 *  1. start: the website creates a request, keeps a random nonce in an httpOnly cookie, and opens
 *     t.me/<bot>?start=login_<token>. Only SHA-256 hashes of the token and nonce are stored.
 *  2. The student presses Start; the bot shows the same 4-digit code as the website and asks to confirm.
 *  3. Only the Telegram user who opened the link can confirm, within 10 minutes.
 *  4. poll: the browser holding the nonce collects the approval once (atomic), and is signed in to the
 *     connected account, a new account is created, or (intent "link") Telegram is connected.
 * Phishing note: someone could send a victim their own login link; the confirmation message names
 * the device and tells the student not to confirm a request they did not start.
 */

const COOKIE = 'sm_tg_login'
const TTL_SECONDS = 600
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

let usernameCache: { at: number; username: string } | null = null
export async function botUsername(): Promise<string> {
  if (usernameCache && Date.now() - usernameCache.at < 10 * 60_000) return usernameCache.username
  const me = await callBot<{ username: string }>('getMe')
  usernameCache = { at: Date.now(), username: me.username }
  return me.username
}

export type LoginStart = { id: string; code: string; link: string; expiresAt: string }

export async function startTelegramLogin(opts: { intent: 'sign_in' | 'link'; userId: string | null; next: string | null; userAgent: string }): Promise<LoginStart> {
  if (opts.intent === 'link' && !opts.userId) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to connect Telegram.')
  let username: string
  try {
    username = await botUsername()
  } catch {
    throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'Telegram sign-in is not available right now.')
  }
  const token = randomBytes(24).toString('base64url') // 32 chars; start payload login_<token> stays under 64
  const nonce = randomBytes(32).toString('base64url')
  const code = String(randomInt(0, 10_000)).padStart(4, '0')
  const admin = createAdminSupabase()

  // Housekeeping: requests are short-lived; nothing older than a day is kept.
  await admin.from('telegram_login_requests').delete().lt('created_at', new Date(Date.now() - 86_400_000).toISOString())

  const { data, error } = await admin
    .from('telegram_login_requests')
    .insert({
      token_hash: sha256(token),
      browser_hash: sha256(nonce),
      intent: opts.intent,
      link_user_id: opts.intent === 'link' ? opts.userId : null,
      code,
      client_hint: clientHint(opts.userAgent),
      next_path: opts.next ? postAuthRedirect(opts.next, '/dashboard').slice(0, 300) : null,
      expires_at: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    })
    .select('id, expires_at')
    .single()
  if (error) throw error

  const store = await cookies()
  store.set(COOKIE, nonce, { httpOnly: true, sameSite: 'lax', secure: isProduction(), path: '/', maxAge: TTL_SECONDS })
  return { id: data.id, code, link: `https://t.me/${username}?start=login_${token}`, expiresAt: data.expires_at }
}

export type LoginPoll =
  | { status: 'waiting'; opened: boolean }
  | { status: 'denied' | 'expired' }
  | { status: 'signed_in'; next: string; isNew: boolean }
  | { status: 'linked' }

export async function pollTelegramLogin(id: string): Promise<LoginPoll> {
  const nonce = (await cookies()).get(COOKIE)?.value
  const admin = createAdminSupabase()
  const { data: row, error } = await admin.from('telegram_login_requests').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  // Only the browser that started the request can see or complete it.
  if (!row || !nonce || row.browser_hash !== sha256(nonce)) throw new ApiError(404, 'NOT_FOUND', 'This sign-in request was not found.')

  const expired = new Date(row.expires_at).getTime() < Date.now()
  if (row.status === 'denied') return { status: 'denied' }
  if (row.status === 'consumed' || (expired && row.status !== 'approved')) return { status: 'expired' }
  if (row.status === 'pending' || row.status === 'opened') return { status: 'waiting', opened: row.status === 'opened' }

  // approved → collect exactly once
  const { data: claimed } = await admin
    .from('telegram_login_requests')
    .update({ status: 'consumed', consumed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'approved')
    .select('*')
    .maybeSingle()
  if (!claimed || !claimed.telegram_user_id) return { status: 'expired' }
  ;(await cookies()).delete(COOKIE)

  const profile = (claimed.telegram_profile ?? {}) as Partial<TelegramUser>
  const tg: TelegramUser = { ...profile, id: Number(claimed.telegram_user_id), first_name: profile.first_name ?? 'Telegram' }

  let userId: string
  let result: LoginPoll
  if (claimed.intent === 'link') {
    const current = await getCurrentUser()
    if (!current || current.id !== claimed.link_user_id) throw new ApiError(403, 'FORBIDDEN', 'Sign in again to connect Telegram.')
    await connectTelegramUser(admin, current.id, tg)
    userId = current.id
    result = { status: 'linked' }
  } else {
    const account = await resolveTelegramAccount(admin, tg, true, 'website')
    userId = account!.userId
    await openSessionFor(admin, userId, tg)
    result = { status: 'signed_in', next: claimed.next_path ?? '/dashboard', isNew: account!.isNew }
  }

  // New account or new connection: offer to share the phone number (optional), once.
  const firstTime = result.status === 'linked' || (result.status === 'signed_in' && result.isNew)
  const { data: account } = firstTime ? await admin.from('telegram_accounts').select('phone_number').eq('user_id', userId).maybeSingle() : { data: null }
  if (account && !account.phone_number && claimed.chat_id) {
    const t = LOGIN_COPY[botLocale(profile.language_code)]
    await callBot('sendMessage', {
      chat_id: claimed.chat_id,
      text: t.phoneAsk,
      reply_markup: { keyboard: [[{ text: t.phoneShare, request_contact: true }], [{ text: t.phoneSkip }]], one_time_keyboard: true, resize_keyboard: true },
    }).catch((err) => console.warn('[telegram] phone request not sent', err))
  }
  return result
}

// ---------------------------------------------------------------------------
// Bot side (called from the webhook)
// ---------------------------------------------------------------------------

type From = { id: number; is_bot?: boolean; first_name: string; last_name?: string; username?: string; language_code?: string }

export async function handleLoginStart(chatId: number, from: From, token: string): Promise<void> {
  const t = LOGIN_COPY[botLocale(from.language_code)]
  const admin = createAdminSupabase()
  const { data: row } = await admin
    .from('telegram_login_requests')
    .select('id, code, client_hint, intent, status, expires_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()
  if (!row || row.status !== 'pending' || new Date(row.expires_at).getTime() < Date.now()) {
    await callBot('sendMessage', { chat_id: chatId, text: t.expired })
    return
  }
  const { data: opened } = await admin
    .from('telegram_login_requests')
    .update({
      status: 'opened',
      telegram_user_id: from.id,
      chat_id: chatId,
      telegram_profile: { first_name: from.first_name, last_name: from.last_name ?? null, username: from.username ?? null, language_code: from.language_code ?? null },
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (!opened) {
    await callBot('sendMessage', { chat_id: chatId, text: t.expired })
    return
  }
  const sent = await callBot<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text: (row.intent === 'link' ? t.linkPrompt : t.loginPrompt).replace('{code}', row.code).replace('{device}', row.client_hint || t.unknownDevice),
    reply_markup: {
      inline_keyboard: [[{ text: t.confirm, callback_data: `lg:ok:${row.id}` }], [{ text: t.cancel, callback_data: `lg:no:${row.id}` }]],
    },
  })
  await admin.from('telegram_login_requests').update({ bot_message_id: sent.message_id }).eq('id', row.id)
}

export async function handleLoginCallback(callback: { id: string; from: From; data?: string; message?: { chat: { id: number }; message_id: number } }): Promise<boolean> {
  const match = /^lg:(ok|no):([0-9a-f-]{36})$/.exec(callback.data ?? '')
  if (!match) return false
  const [, action, id] = match
  const t = LOGIN_COPY[botLocale(callback.from.language_code)]
  const admin = createAdminSupabase()
  const { data: row } = await admin.from('telegram_login_requests').select('status, telegram_user_id, expires_at').eq('id', id!).maybeSingle()

  const answer = (text: string) => callBot('answerCallbackQuery', { callback_query_id: callback.id, text })
  const edit = (text: string) =>
    callback.message
      ? callBot('editMessageText', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, text }).catch(() => undefined)
      : Promise.resolve(undefined)

  if (!row || Number(row.telegram_user_id) !== callback.from.id) {
    await answer(t.notYours)
    return true
  }
  if (row.status !== 'opened' || new Date(row.expires_at).getTime() < Date.now()) {
    await answer(t.expiredShort)
    await edit(t.expired)
    return true
  }
  const approve = action === 'ok'
  const { data: updated } = await admin
    .from('telegram_login_requests')
    .update(approve ? { status: 'approved', approved_at: new Date().toISOString() } : { status: 'denied' })
    .eq('id', id!)
    .eq('status', 'opened')
    .select('id')
    .maybeSingle()
  if (!updated) {
    await answer(t.expiredShort)
    return true
  }
  await answer(approve ? t.approvedShort : t.deniedShort)
  await edit(approve ? t.approved : t.denied)
  return true
}

/** "Share contact" reply: only the student's own number, stored on their Telegram connection. */
export async function handleSharedContact(chatId: number, from: From, contact: { phone_number: string; user_id?: number }): Promise<void> {
  const t = LOGIN_COPY[botLocale(from.language_code)]
  const done = (text: string) => callBot('sendMessage', { chat_id: chatId, text, reply_markup: { remove_keyboard: true } })
  if (contact.user_id !== from.id) return void (await done(t.phoneNotOwn))
  const phone = normalizePhone(contact.phone_number)
  if (!phone) return void (await done(t.phoneNotOwn))
  const admin = createAdminSupabase()
  const { data } = await admin
    .from('telegram_accounts')
    .update({ phone_number: phone, phone_shared_at: new Date().toISOString() })
    .eq('telegram_user_id', from.id)
    .select('user_id')
  await done(data?.length ? t.phoneSaved : t.phoneNoAccount)
}

export async function handlePhoneSkip(chatId: number, from: From): Promise<void> {
  const t = LOGIN_COPY[botLocale(from.language_code)]
  await callBot('sendMessage', { chat_id: chatId, text: t.phoneSkipped, reply_markup: { remove_keyboard: true } })
}
