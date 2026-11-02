'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menus'
import { markAllNotificationsReadAction } from '@/features/notifications/actions'
import type { NotificationItem } from '@/features/notifications/server'

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function NotificationsMenu({
  items,
  unread,
  tone = 'light',
  labels = { title: 'Notifications', empty: 'No notifications yet.', markRead: 'Mark all as read' },
}: {
  items: NotificationItem[]
  unread: number
  tone?: 'light' | 'dark'
  labels?: { title: string; empty: string; markRead: string }
}) {
  const [pending, startTransition] = useTransition()
  return (
    <Popover>
      <PopoverTrigger
        aria-label={unread > 0 ? `${labels.title}: ${unread} unread` : labels.title}
        className={cn(
          'relative rounded-md p-2',
          tone === 'dark' ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-foreground hover:bg-muted',
        )}
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground tabular">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{labels.title}</p>
          {unread > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => markAllNotificationsReadAction())}
              className="text-[13px] text-primary hover:underline disabled:opacity-50"
            >
              {labels.markRead}
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items.map((n) => {
              const body = (
                <div className="flex gap-3 px-4 py-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-[13px] text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              )
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="block hover:bg-muted/60">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
