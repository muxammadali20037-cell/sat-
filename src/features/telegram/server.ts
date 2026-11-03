import 'server-only'
import { cookies } from 'next/headers'
import { ApiError } from '@/lib/api/errors'
import { isProduction } from '@/lib/env'
import { writeAudit } from '@/lib/audit'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase, type Db } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/session'
import { validateInitData, telegramDisplayName, type TelegramUser, type ValidInitData } from '@/lib/telegram/init-data'
import { botToken } from '@/lib/telegram/bot'
import { MINI_APP_COOKIE, isTelegramOnlyEmail, startParamRoute, telegramEmail } from './shared'

/**
 * Telegram Mini App accounts. Identity comes only from Telegram's signed launch data (initData),
 * validated with the bot token; nothing the browser claims about the Telegram user is trusted.
 */

const INVALID_MESSAGE = 'Telegram could not confirm who you are. Close the app and open it again from the bot.'

function verifyLaunch(initData: string): ValidInitData {
  const token = botToken()
  if (!token) throw new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'The Telegram app is not configured for this site yet.')
  const result = validateInitData(initData, token)
  if (!result.ok) throw new ApiError(401, 'UNAUTHENTICATED', INVALID_MESSAGE, { reason: `telegram_${result.reason}` })
  return result.data
}

const profileFields = (user: TelegramUser) => ({
  username: user.username?.slice(0, 64) ?? null,
  first_name: user.first_name.slice(0, 128) || null,
  last_name: user.last_name?.slice(0, 128) ?? null,
  language_code: user.language_code?.slice(0, 16) ?? null,
})

/** Interface language for a new account: Uzbek unless Telegram says English. */
const localeFor = (user: TelegramUser) => {
  const code = user.language_code?.toLowerCase() ?? ''
  return code.startsWith('en') ? 'en' : code.startsWith('ru') ? 'ru' : 'uz'
}

async function rememberMiniApp() {
  const store = await cookies()
  store.set(MINI_APP_COOKIE, '1', { path: '/', sameSite: 'lax', secure: isProduction(), maxAge: 60 * 60 * 24 * 365, httpOnly: false })
}

/**
 * Signs the browser in as the given account without a password: an admin-generated magic-link token
 * is verified immediately on the server, which sets the normal Supabase session cookies. No email is sent.
 */
async function establishSession(admin: Db, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data?.properties?.hashed_token) {
    console.error('[telegram] could not generate a sign-in token', error)
    throw new ApiError(502, 'INTERNAL_ERROR', 'Sign-in failed. Please try again.')
  }
  const db = await createServerSupabase()
  const { error: verifyError } = await db.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token })
  if (verifyError) {
    console.error('[telegram] could not verify the sign-in token', verifyError)
    throw new ApiError(502, 'INTERNAL_ERROR', 'Sign-in failed. Please try again.')
  }
}

/** Creates the SAT MASTER account for a Telegram user (idempotent: the placeholder email is per Telegram id). */
async function createTelegramAccount(admin: Db, user: TelegramUser): Promise<string> {
  const email = telegramEmail(user.id)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: telegramDisplayName(user), locale: localeFor(user), signup_source: 'telegram' },
  })
  if (data?.user) return data.user.id
  // Two launches at the same moment: the other request created it first.
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) return existing.id
  console.error('[telegram] could not create the account', error)
  throw new ApiError(502, 'INTERNAL_ERROR', 'Your account could not be created. Please try again.')
}

export type TelegramSessionResult =
  | { status: 'signed_in'; isNew: boolean; next: string }
  | { status: 'unlinked'; firstName: string }

/** The account connected to a Telegram user, or a new one created from the Telegram profile. */
export async function resolveTelegramAccount(
  admin: Db,
  tg: TelegramUser,
  create: boolean,
  source: 'Mini App' | 'website',
): Promise<{ userId: string; isNew: boolean } | null> {
  const { data: link, error } = await admin.from('telegram_accounts').select('user_id').eq('telegram_user_id', tg.id).maybeSingle()
  if (error) throw error
  if (link) return { userId: link.user_id, isNew: false }
  if (!create) return null
  const userId = await createTelegramAccount(admin, tg)
  // created_via 'mini_app' = the account was created from Telegram (Mini App or website Telegram sign-in).
  const { error: insertError } = await admin
    .from('telegram_accounts')
    .upsert({ user_id: userId, telegram_user_id: tg.id, created_via: 'mini_app', ...profileFields(tg) }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (insertError) throw insertError
  await writeAudit({
    actorId: userId,
    action: 'telegram.account_created',
    entityType: 'profile',
    entityId: userId,
    summary: `Account created with Telegram (${source})`,
    after: { telegram_user_id: tg.id },
  })
  return { userId, isNew: true }
}

/** Signs this browser in as the account (checks it is usable; keeps a live session for the same account). */
export async function openSessionFor(admin: Db, userId: string, tg: TelegramUser): Promise<void> {
  const { data: profile, error: profileError } = await admin.from('profiles').select('email, is_suspended, deleted_at').eq('id', userId).single()
  if (profileError) throw profileError
  if (profile.deleted_at) throw new ApiError(403, 'FORBIDDEN', 'This account has been deleted.')
  if (profile.is_suspended) throw new ApiError(403, 'FORBIDDEN', 'This account is suspended.')
  await admin.from('telegram_accounts').update({ ...profileFields(tg), last_seen_at: new Date().toISOString() }).eq('user_id', userId)
  const current = await getCurrentUser()
  if (current?.id !== userId) await establishSession(admin, profile.email)
}

/**
 * Opens the Mini App session. A Telegram user already connected to an account is signed into it.
 * Otherwise the caller decides: `create` makes a new account from the Telegram profile; without it
 * the result is `unlinked`, so the app can offer "use my existing account" first.
 */
export async function signInWithTelegram(initData: string, create: boolean): Promise<TelegramSessionResult> {
  const launch = verifyLaunch(initData)
  const admin = createAdminSupabase()
  const tg = launch.user
  const account = await resolveTelegramAccount(admin, tg, create, 'Mini App')
  if (!account) {
    await rememberMiniApp()
    return { status: 'unlinked', firstName: tg.first_name.slice(0, 64) }
  }
  await openSessionFor(admin, account.userId, tg)
  await rememberMiniApp()
  return { status: 'signed_in', isNew: account.isNew, next: startParamRoute(launch.startParam) }
}

/** Connects an account to a verified Telegram user (one Telegram ↔ one account). */
export async function connectTelegramUser(admin: Db, userId: string, tg: TelegramUser): Promise<void> {
  const [{ data: byTelegram }, { data: byUser }] = await Promise.all([
    admin.from('telegram_accounts').select('user_id').eq('telegram_user_id', tg.id).maybeSingle(),
    admin.from('telegram_accounts').select('telegram_user_id').eq('user_id', userId).maybeSingle(),
  ])
  if (byTelegram && byTelegram.user_id !== userId) {
    throw new ApiError(409, 'CONFLICT', 'This Telegram account is already connected to another SAT MASTER account.', { reason: 'telegram_in_use' })
  }
  if (byUser && byUser.telegram_user_id !== tg.id) {
    throw new ApiError(409, 'CONFLICT', 'Your account is already connected to a different Telegram account. Disconnect it in Settings first.', {
      reason: 'account_has_other_telegram',
    })
  }
  if (byTelegram) return
  const { error } = await admin.from('telegram_accounts').insert({ user_id: userId, telegram_user_id: tg.id, created_via: 'link', ...profileFields(tg) })
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'CONFLICT', 'This Telegram account was just connected elsewhere.', { reason: 'telegram_in_use' })
    throw error
  }
  await writeAudit({
    actorId: userId,
    action: 'telegram.link',
    entityType: 'profile',
    entityId: userId,
    summary: 'Connected a Telegram account',
    after: { telegram_user_id: tg.id },
  })
}

/** Connects the signed-in account to the Telegram user who opened the Mini App. */
export async function linkTelegram(userId: string, initData: string): Promise<{ linked: true; next: string }> {
  const launch = verifyLaunch(initData)
  await connectTelegramUser(createAdminSupabase(), userId, launch.user)
  await rememberMiniApp()
  return { linked: true, next: startParamRoute(launch.startParam) }
}

/** Disconnects Telegram. Refused for accounts created from Telegram: they have no other way to sign in. */
export async function unlinkTelegram(userId: string, email: string): Promise<{ unlinked: boolean }> {
  if (isTelegramOnlyEmail(email)) {
    throw new ApiError(409, 'CONFLICT', 'This account was created in Telegram and can only be opened from there, so it cannot be disconnected.', {
      reason: 'telegram_only_account',
    })
  }
  const admin = createAdminSupabase()
  const { data, error } = await admin.from('telegram_accounts').delete().eq('user_id', userId).select('telegram_user_id')
  if (error) throw error
  if (data?.length) {
    await writeAudit({
      actorId: userId,
      action: 'telegram.unlink',
      entityType: 'profile',
      entityId: userId,
      summary: 'Disconnected the Telegram account',
      before: { telegram_user_id: data[0]!.telegram_user_id },
    })
  }
  return { unlinked: Boolean(data?.length) }
}

/** The signed-in student's Telegram connection, for Settings. */
export async function myTelegramAccount(db: Db, userId: string) {
  const { data } = await db.from('telegram_accounts').select('username, first_name, created_via, linked_at, phone_number').eq('user_id', userId).maybeSingle()
  return data
}

/** True when the current request comes from inside the Telegram Mini App. */
export async function isMiniAppRequest(): Promise<boolean> {
  return (await cookies()).get(MINI_APP_COOKIE)?.value === '1'
}
