/**
 * Browser-side helpers for the Telegram Mini App. Types cover the parts of Telegram.WebApp we use
 * (https://core.telegram.org/bots/webapps); the SDK script is loaded by the root layout only when
 * the site runs inside Telegram.
 */

type Inset = { top: number; bottom: number; left: number; right: number }

export type TelegramWebApp = {
  initData: string
  initDataUnsafe: { user?: { first_name?: string; language_code?: string }; start_param?: string }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  isExpanded: boolean
  isFullscreen?: boolean
  safeAreaInset?: Inset
  contentSafeAreaInset?: Inset
  isVersionAtLeast(version: string): boolean
  ready(): void
  expand(): void
  close(): void
  requestFullscreen?(): void
  disableVerticalSwipes?(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  setBottomBarColor?(color: string): void
  openLink(url: string, options?: { try_instant_view?: boolean }): void
  onEvent(event: string, handler: (...args: unknown[]) => void): void
  offEvent(event: string, handler: (...args: unknown[]) => void): void
  BackButton: { isVisible: boolean; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void; notificationOccurred(type: 'error' | 'success' | 'warning'): void }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export const TELEGRAM_SDK_URL = 'https://telegram.org/js/telegram-web-app.js'

/** True once the head script decided the page runs inside Telegram (set before first paint). */
export function isMiniApp(): boolean {
  return typeof document !== 'undefined' && document.documentElement.hasAttribute('data-tg-app')
}

/** The Telegram SDK object when it has loaded and the page really is a Mini App launch. */
export function webApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null
  const wa = window.Telegram?.WebApp
  return wa && wa.initData ? wa : null
}

/** Resolves with the SDK object (or null outside Telegram) once the script has loaded. */
export function whenWebApp(timeoutMs = 6000): Promise<TelegramWebApp | null> {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (window.Telegram?.WebApp) return resolve(webApp())
      if (Date.now() - started > timeoutMs) return resolve(null)
      setTimeout(tick, 50)
    }
    tick()
  })
}
