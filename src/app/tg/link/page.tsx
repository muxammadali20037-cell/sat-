import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/session'
import { TelegramLink } from '@/components/telegram/telegram-link'

export const metadata: Metadata = { title: 'Connect Telegram', robots: { index: false, follow: false } }

/** After signing in with an existing account inside the Mini App: connect it to this Telegram user. */
export default async function TelegramLinkPage() {
  await requireUser({ next: '/tg/link' })
  return <TelegramLink />
}
