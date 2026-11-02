import type { Metadata } from 'next'
import { TelegramEntry } from '@/components/telegram/telegram-entry'

export const metadata: Metadata = { title: 'Telegram', robots: { index: false, follow: false } }

/** Telegram Mini App entry (the URL configured in BotFather). Signs in with Telegram, then opens the app. */
export default async function TelegramEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  return <TelegramEntry signedOut={sp.signed_out === '1'} />
}
