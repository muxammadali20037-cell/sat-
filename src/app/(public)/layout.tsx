import { PublicHeader } from '@/components/marketing/public-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { PUBLIC_NAV } from '@/config/navigation'
import { getDict } from '@/lib/i18n/server'
import { commonDict } from '@/lib/i18n/dictionaries/common'
import { publicDict } from '@/lib/i18n/dictionaries/public'

/** Public marketing site chrome. Uses the public locale (cookie / Accept-Language) — no auth call. */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [t, p] = await Promise.all([getDict(commonDict, { public: true }), getDict(publicDict, { public: true })])
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <PublicHeader
        labels={{
          nav: PUBLIC_NAV.map((item) => ({ href: item.href, label: t.nav[item.labelKey] })),
          login: t.nav.login,
          register: t.nav.register,
          openMenu: t.nav.openMenu,
          closeMenu: t.nav.closeMenu,
          language: t.language,
          primaryNav: t.brand,
          skipToContent: p.labels.skipToContent,
        }}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter
        labels={{
          tagline: t.tagline,
          product: t.footer.product,
          company: t.footer.company,
          legal: t.footer.legal,
          features: t.nav.features,
          pricing: t.nav.pricing,
          faq: t.nav.faq,
          about: t.nav.about,
          contact: t.nav.contact,
          terms: t.footer.terms,
          privacy: t.footer.privacy,
          rights: t.footer.rights,
          disclaimer: t.footer.disclaimer,
        }}
      />
    </div>
  )
}
