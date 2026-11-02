'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Menu, MoreHorizontal, Shield, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { NAV_ICONS } from './nav-icons'
import { Drawer, DrawerContent, DrawerClose } from '@/components/ui/dialog'
import { signOutAction } from '@/features/auth/sign-out'
import { NotificationsMenu } from './notifications-menu'
import type { NavItem, NavSection } from '@/config/navigation'
import type { NotificationItem } from '@/features/notifications/server'

export type ShellUser = { name: string; email: string; roleLabel: string; isStaff: boolean; planName?: string }

type Props = {
  variant: 'student' | 'admin'
  sections: NavSection[]
  accountItems?: NavItem[]
  mobileTabs?: NavItem[]
  /** labelKey → label; admin nav uses literal labels so this can be omitted */
  labels?: Record<string, string>
  user: ShellUser
  logoutLabel: string
  switchLink?: { href: string; label: string }
  notifications?: { items: NotificationItem[]; unread: number; labels?: { title: string; empty: string; markRead: string } }
  children: React.ReactNode
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function NavLink({ item, label, active, onNavigate }: { item: NavItem; label: string; active: boolean; onNavigate?: () => void }) {
  const Icon = NAV_ICONS[item.icon]
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-3 rounded-md px-3 text-[14px] transition-colors',
        active ? 'bg-sidebar-active font-medium text-sidebar-active-foreground' : 'text-sidebar-foreground hover:bg-white/5 hover:text-white',
      )}
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-accent' : 'opacity-80')} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  )
}

function SidebarBody({ props, pathname, onNavigate }: { props: Props; pathname: string; onNavigate?: () => void }) {
  const label = (key: string) => props.labels?.[key] ?? key
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 px-5">
        <Logo href={props.variant === 'admin' ? '/admin' : '/dashboard'} onDark />
        {props.variant === 'admin' && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-white/80">Admin</span>
        )}
        {props.notifications && !onNavigate && (
          <div className="ml-auto">
            <NotificationsMenu tone="dark" {...props.notifications} />
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main">
        {props.sections.map((section, i) => (
          <div key={section.title ?? i}>
            {section.title && <p className="mb-1.5 px-3 text-xs font-medium text-white/45">{section.title}</p>}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} label={label(item.labelKey)} active={isActive(pathname, item)} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-white/10 px-3 py-3">
        {props.accountItems?.map((item) => (
          <NavLink key={item.href} item={item} label={label(item.labelKey)} active={isActive(pathname, item)} onNavigate={onNavigate} />
        ))}
        {props.switchLink && (
          <Link
            href={props.switchLink.href}
            onClick={onNavigate}
            className="flex h-9 items-center gap-3 rounded-md px-3 text-[14px] text-sidebar-foreground hover:bg-white/5 hover:text-white"
          >
            <Shield className="size-4 opacity-80" aria-hidden />
            {props.switchLink.label}
          </Link>
        )}
        <div className="mt-2 flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[13px] font-semibold text-white">
            {(props.user.name || props.user.email).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{props.user.name || props.user.email}</p>
            <p className="truncate text-xs text-white/50">{props.user.planName ?? props.user.roleLabel}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label={props.logoutLabel}
              title={props.logoutLabel}
              className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export function AppShell(props: Props) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const label = (key: string) => props.labels?.[key] ?? key
  const sidebarBg = props.variant === 'admin' ? 'bg-navy-800 dark:bg-sidebar' : 'bg-sidebar'

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden w-64 lg:block', sidebarBg)}>
        <SidebarBody props={props} pathname={pathname} />
      </aside>

      {/* Mobile / tablet top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Logo href={props.variant === 'admin' ? '/admin' : '/dashboard'} />
        <div className="flex items-center gap-1">
        {props.notifications && <NotificationsMenu {...props.notifications} />}
        <Drawer open={open} onOpenChange={setOpen}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-foreground hover:bg-muted"
            aria-label={label('openMenu') === 'openMenu' ? 'Open menu' : label('openMenu')}
          >
            <Menu className="size-5" />
          </button>
          <DrawerContent side="left" title="Navigation" className={cn('border-0', sidebarBg)}>
            <DrawerClose className="absolute right-3 top-4 rounded-md p-1.5 text-white/70 hover:bg-white/10" aria-label="Close menu">
              <X className="size-4" />
            </DrawerClose>
            <SidebarBody props={props} pathname={pathname} onNavigate={() => setOpen(false)} />
          </DrawerContent>
        </Drawer>
        </div>
      </header>

      <main id="main" className={cn('mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8', props.mobileTabs && 'pb-24 lg:pb-8')}>
        {props.children}
      </main>

      {/* Phone bottom tabs */}
      {props.mobileTabs && (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          {props.mobileTabs.map((item) => {
            const Icon = NAV_ICONS[item.icon]
            const active = isActive(pathname, item)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]', active ? 'text-primary' : 'text-muted-foreground')}
              >
                <Icon className="size-5" aria-hidden />
                {label(item.labelKey)}
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
          >
            <MoreHorizontal className="size-5" aria-hidden />
            {label('more')}
          </button>
        </nav>
      )}
    </div>
  )
}
