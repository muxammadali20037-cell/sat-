import Link from 'next/link'
import { Logo } from '@/components/layout/logo'

export type FooterLabels = {
  tagline: string
  product: string
  company: string
  legal: string
  features: string
  pricing: string
  faq: string
  about: string
  contact: string
  terms: string
  privacy: string
  rights: string
  disclaimer: string
}

export function SiteFooter({ labels }: { labels: FooterLabels }) {
  const year = new Date().getFullYear()
  const columns = [
    {
      title: labels.product,
      links: [
        { href: '/features', label: labels.features },
        { href: '/pricing', label: labels.pricing },
        { href: '/faq', label: labels.faq },
      ],
    },
    {
      title: labels.company,
      links: [
        { href: '/about', label: labels.about },
        { href: '/contact', label: labels.contact },
      ],
    },
    {
      title: labels.legal,
      links: [
        { href: '/terms', label: labels.terms },
        { href: '/privacy', label: labels.privacy },
      ],
    },
  ]
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid grid-cols-1 max-w-[1200px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">{labels.tagline}</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-sm font-semibold text-foreground">{column.title}</p>
            <ul className="mt-2 grid grid-cols-1">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-10 items-center text-sm text-muted-foreground hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto grid grid-cols-1 max-w-[1200px] gap-2 px-4 py-6 text-xs leading-relaxed text-muted-foreground sm:px-6 lg:px-8">
          <p>{labels.disclaimer}</p>
          <p>
            © {year} SAT MASTER. {labels.rights}
          </p>
        </div>
      </div>
    </footer>
  )
}
