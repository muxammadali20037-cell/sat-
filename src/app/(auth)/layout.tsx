import type { Metadata } from 'next'
import { Check } from 'lucide-react'
import { Logo, LogoMark } from '@/components/layout/logo'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { getDict } from '@/lib/i18n/server'
import { authDict } from '@/lib/i18n/dictionaries/auth'
import { commonDict } from '@/lib/i18n/dictionaries/common'

export const metadata: Metadata = { robots: { index: false, follow: true } }

/** Calm, centred auth layout: form column + a short value statement on wide screens. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const [t, common] = await Promise.all([getDict(authDict, { public: true }), getDict(commonDict, { public: true })])
  return (
    <div className="grid grid-cols-1 min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <div className="flex min-w-0 flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Logo />
          <LocaleSwitcher label={common.language} />
        </header>
        <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:px-8 sm:pt-0">
          {children}
        </main>
      </div>
      <aside className="hidden bg-navy-900 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <LogoMark onDark className="size-8" />
        <div>
          <p className="font-display text-[26px] font-semibold leading-snug">{t.panel.title}</p>
          <ul className="mt-8 grid grid-cols-1 gap-4">
            {t.panel.points.map((point) => (
              <li key={point} className="flex gap-3 text-[15px] text-white/80">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs leading-relaxed text-white/50">
          {t.panel.disclaimer}
          <br />
          {common.footer.disclaimer}
        </p>
      </aside>
    </div>
  )
}
