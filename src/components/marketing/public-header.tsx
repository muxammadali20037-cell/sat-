'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/layout/logo'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent } from '@/components/ui/dialog'

export type PublicHeaderLabels = {
  nav: Array<{ href: string; label: string }>
  login: string
  register: string
  openMenu: string
  closeMenu: string
  language: string
  primaryNav: string
  skipToContent: string
}

/**
 * Marketing header. On the homepage it sits on the navy hero field (light text); elsewhere it
 * is a plain surface bar. Below `md` the links move into a right-hand drawer.
 */
export function PublicHeader({ labels }: { labels: PublicHeaderLabels }) {
  const pathname = usePathname()
  const onNavy = pathname === '/'
  const [open, setOpen] = React.useState(false)

  return (
    <header className={cn(onNavy ? 'bg-navy-900 text-white' : 'border-b border-border bg-surface')}>
      <a
        href="#main"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
      >
        {labels.skipToContent}
      </a>
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Logo onDark={onNavy} className="shrink-0" />

        <nav aria-label={labels.primaryNav} className="ml-6 hidden md:block">
          <ul className="flex items-center gap-1">
            {labels.nav.map((item) => {
              const active = pathname === item.href
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors duration-150',
                      onNavy
                        ? 'text-white/75 hover:bg-white/10 hover:text-white'
                        : active
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher
            label={labels.language}
            className={cn(
              'hidden lg:inline-flex',
              onNavy && '[&_option]:text-navy-900 [&_select]:text-white [&_svg]:text-white/70',
            )}
          />
          <Button
            asChild
            variant="ghost"
            className={cn('hidden md:inline-flex', onNavy && 'text-white hover:bg-white/10')}
          >
            <Link href="/login">{labels.login}</Link>
          </Button>
          <Button asChild className="px-3 sm:px-4">
            <Link href="/register">{labels.register}</Link>
          </Button>

          <Drawer open={open} onOpenChange={setOpen}>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={labels.openMenu}
              aria-expanded={open}
              className={cn(
                'inline-flex size-10 items-center justify-center rounded-md md:hidden',
                onNavy ? 'text-white hover:bg-white/10' : 'text-foreground hover:bg-muted',
              )}
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <DrawerContent side="right" title={labels.primaryNav}>
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <Logo />
                <DrawerClose
                  aria-label={labels.closeMenu}
                  className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-5" aria-hidden />
                </DrawerClose>
              </div>
              <nav aria-label={labels.primaryNav} className="flex-1 overflow-y-auto px-2 py-3">
                <ul className="grid grid-cols-1 gap-0.5">
                  {labels.nav.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={pathname === item.href ? 'page' : undefined}
                        className="flex h-12 items-center rounded-md px-3 text-[15px] font-medium text-foreground hover:bg-muted aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="grid grid-cols-1 gap-3 border-t border-border p-4">
                <LocaleSwitcher label={labels.language} className="h-10" />
                <Button asChild variant="secondary" size="lg">
                  <Link href="/login" onClick={() => setOpen(false)}>
                    {labels.login}
                  </Link>
                </Button>
                <Button asChild size="lg">
                  <Link href="/register" onClick={() => setOpen(false)}>
                    {labels.register}
                  </Link>
                </Button>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </header>
  )
}
