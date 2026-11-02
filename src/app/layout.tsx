import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { Toaster } from '@/components/ui/toast'
import { LocaleProvider } from '@/lib/i18n/client'
import { getPublicLocale } from '@/lib/i18n/server'
import { siteConfig } from '@/config/site'
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getPublicLocale()
  return (
    <html lang={locale} className={GeistSans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <LocaleProvider locale={locale}>
          {children}
          <Toaster />
        </LocaleProvider>
      </body>
    </html>
  )
}
