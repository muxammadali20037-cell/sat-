/**
 * Telegram Mini App constants shared by server and browser code. Nothing secret here.
 */

/** Accounts created from Telegram get a placeholder address on a reserved, undeliverable domain. */
export const TELEGRAM_EMAIL_DOMAIN = 'telegram.satmaster.invalid'
export const telegramEmail = (telegramUserId: number) => `tg-${telegramUserId}@${TELEGRAM_EMAIL_DOMAIN}`
export const isTelegramOnlyEmail = (email: string | null | undefined) => Boolean(email?.toLowerCase().endsWith(`@${TELEGRAM_EMAIL_DOMAIN}`))

/**
 * Set when the site runs inside Telegram. Read by the head script (layout before paint), the client
 * bridge and the server (no purchase UI, checkout refused). Not sensitive, so not httpOnly; Telegram's
 * in-app browser keeps its own cookie jar, so it never reaches the student's normal browser.
 */
export const MINI_APP_COOKIE = 'sm_tg'

/** Where the Mini App opens; also the URL configured in BotFather. */
export const MINI_APP_PATH = '/tg'

/** start_param values a link may carry (t.me/<bot>?startapp=<value>) → page to open. */
export const START_PARAM_ROUTES: Record<string, string> = {
  home: '/dashboard',
  practice: '/dashboard/practice',
  guides: '/dashboard/guides',
  courses: '/dashboard/courses',
  tutor: '/dashboard/ai-tutor',
  exams: '/dashboard/mock-exams',
  diagnostic: '/dashboard/diagnostic',
  plan: '/dashboard/study-plan',
}

export function startParamRoute(startParam: string | null | undefined): string {
  return (startParam && START_PARAM_ROUTES[startParam]) || '/dashboard'
}
