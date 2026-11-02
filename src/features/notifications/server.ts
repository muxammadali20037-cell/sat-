import 'server-only'
import { createServerSupabase } from '@/lib/supabase/server'

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  readAt: string | null
  createdAt: string
}

/** Latest notifications for the signed-in user (RLS: own rows only). */
export async function getMyNotifications(limit = 10): Promise<{ items: NotificationItem[]; unread: number }> {
  try {
    const db = await createServerSupabase()
    const [list, unread] = await Promise.all([
      db.from('notifications').select('id, type, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(limit),
      db.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ])
    if (list.error) throw list.error
    return {
      items: list.data.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
      unread: unread.count ?? 0,
    }
  } catch (err) {
    console.error('[notifications] failed to load', err)
    return { items: [], unread: 0 }
  }
}
