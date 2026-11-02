'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { STUDENT_MOBILE_TABS } from '@/config/navigation'
import { MINI_APP_COOKIE, MINI_APP_PATH } from '@/features/telegram/shared'
import { isMiniApp, whenWebApp, type TelegramWebApp } from '@/lib/telegram/client'

/**
 * Connects the site to Telegram when it runs as a Mini App (renders nothing):
 * - full screen on phones (Bot API 8.0+), no swipe-to-close while scrolling (7.7+);
 * - Telegram's header, background and bottom bar take the app's colours; light/dark follows Telegram
 *   unless the student picked a theme;
 * - Telegram's back button mirrors in-app navigation (hidden on the tab roots);
 * - links to other sites open in the external browser instead of replacing the app.
 */

const ROOT_PATHS = new Set<string>([MINI_APP_PATH, '/dashboard/onboarding', ...STUDENT_MOBILE_TABS.map((t) => t.href)])
/**
 * A design token as #RRGGBB (the only format Telegram accepts). The build may shorten #ffffff to
 * #fff or a browser may report rgb(), so the value is resolved through a probe element.
 */
function cssColor(name: string): string | null {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).color
  probe.remove()
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb)
  if (!m) return null
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
}

function applyColors(app: TelegramWebApp) {
  const surface = cssColor('--surface')
  const background = cssColor('--background')
  try {
    if (surface) app.setHeaderColor(surface)
    if (background) app.setBackgroundColor(background)
    if (surface && app.isVersionAtLeast('7.10')) app.setBottomBarColor?.(surface)
  } catch {
    // Older clients reject custom colours; Telegram's defaults are fine.
  }
}

function followTelegramScheme(app: TelegramWebApp) {
  let chosen: string | null = null
  try {
    chosen = localStorage.getItem('sm_theme')
  } catch {}
  try {
    sessionStorage.setItem('sm_tg_scheme', app.colorScheme)
  } catch {}
  if (chosen === null || chosen === 'system') document.documentElement.classList.toggle('dark', app.colorScheme === 'dark')
}

function init(app: TelegramWebApp) {
  app.ready()
  app.expand()
  const phone = app.platform === 'ios' || app.platform === 'android'
  if (phone && app.isVersionAtLeast('8.0') && !app.isFullscreen) {
    try {
      app.requestFullscreen?.()
    } catch {}
  }
  if (app.isVersionAtLeast('7.7')) {
    try {
      app.disableVerticalSwipes?.()
    } catch {}
  }
  followTelegramScheme(app)
  applyColors(app)
  app.onEvent('themeChanged', () => {
    followTelegramScheme(app)
    applyColors(app)
  })
  document.cookie = `${MINI_APP_COOKIE}=1; path=/; max-age=31536000; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`
}

export function TelegramBridge() {
  const router = useRouter()
  const pathname = usePathname()
  const [app, setApp] = React.useState<TelegramWebApp | null>(null)

  React.useEffect(() => {
    if (!isMiniApp()) return
    let cancelled = false
    whenWebApp().then((wa) => {
      if (cancelled) return
      if (!wa) {
        // The mini-app cookie is set but this is not a Telegram launch (e.g. a link opened in a browser).
        if (window.Telegram?.WebApp?.platform === 'unknown') {
          document.documentElement.removeAttribute('data-tg-app')
          document.cookie = `${MINI_APP_COOKIE}=; path=/; max-age=0`
        }
        return
      }
      init(wa)
      setApp(wa)
    })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!app) return
    if (ROOT_PATHS.has(pathname)) app.BackButton.hide()
    else app.BackButton.show()
    const onBack = () => {
      if (window.history.length > 1) router.back()
      else router.push('/dashboard')
    }
    app.BackButton.onClick(onBack)
    return () => app.BackButton.offClick(onBack)
  }, [app, pathname, router])

  React.useEffect(() => {
    if (!app) return
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const url = new URL(anchor.href, location.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      if (url.origin === location.origin) return
      event.preventDefault()
      app.openLink(url.toString())
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [app])

  return null
}
