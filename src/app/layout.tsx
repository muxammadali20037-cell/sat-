import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { Toaster } from '@/components/ui/toast'
import { LocaleProvider } from '@/lib/i18n/client'
import { getPublicLocale } from '@/lib/i18n/server'
import { siteConfig } from '@/config/site'
import { TelegramBridge } from '@/components/telegram/telegram-bridge'
import { TELEGRAM_SDK_URL } from '@/lib/telegram/client'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: `${siteConfig.name} — ${siteConfig.tagline}`, template: `%s · ${siteConfig.name}` },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: { title: siteConfig.name, description: siteConfig.description, type: 'website' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#101827' },
  ],
  width: 'device-width',
  initialScale: 1,
}

// Applies the saved theme before paint to avoid a flash (value set in Settings → Appearance).
const themeScript = `try{var t=localStorage.getItem('sm_theme');if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`

/**
 * Telegram Mini App: decided before paint so the layout never jumps. Inside Telegram (launch hash,
 * or the sm_tg cookie on later pages) mark <html data-tg-app>, follow Telegram's light/dark scheme
 * unless the student chose a theme, and load Telegram's script. Outside Telegram this does nothing.
 */
const telegramScript = `try{var d=document.documentElement,h=location.hash||'',tg=h.indexOf('tgWebAppData=')>-1||/(?:^|;\\s*)sm_tg=1/.test(document.cookie);if(tg){d.setAttribute('data-tg-app','');var sc=null;try{var m=/tgWebAppThemeParams=([^&]*)/.exec(h);if(m){var bg=JSON.parse(decodeURIComponent(m[1])).bg_color||'';var n=parseInt(bg.slice(1),16);if(bg.length===7){sc=((n>>16&255)*299+(n>>8&255)*587+(n&255)*114)/1000<128?'dark':'light';sessionStorage.setItem('sm_tg_scheme',sc)}}else{sc=sessionStorage.getItem('sm_tg_scheme')}}catch(e){}var t=null;try{t=localStorage.getItem('sm_theme')}catch(e){}if(sc&&(t===null||t==='system')){d.classList.toggle('dark',sc==='dark')}var s=document.createElement('script');s.src='${TELEGRAM_SDK_URL}';s.async=false;document.head.appendChild(s)}}catch(e){}`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getPublicLocale()
  return (
    <html lang={locale} className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: telegramScript }} />
      </head>
      <body className="min-h-dvh">
        <LocaleProvider locale={locale}>
          {children}
          <Toaster />
          <TelegramBridge />
        </LocaleProvider>
      </body>
    </html>
  )
}
