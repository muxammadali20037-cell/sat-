import 'server-only'
import { AccessToken, TrackSource } from 'livekit-server-sdk'
import { serverEnv } from '@/lib/env'
import type { Db } from '@/lib/supabase/server'
import { getMembership, teachableGroupIds } from '@/features/classroom/server'
import { isStaffRole } from '@/features/classroom/permissions'
import { liveRoomName, liveWindow, type LiveWindow } from '@/features/classroom/lessons'

/**
 * In-app live lessons (LiveKit). The API key and secret stay on the server; the browser only ever
 * receives a short-lived, room-scoped token for a lesson it is allowed to join.
 */

export type LiveConfig = { url: string; apiKey: string; apiSecret: string }

/** null = NOT_CONFIGURED (no LiveKit project connected to this deployment). */
export function liveConfig(): LiveConfig | null {
  const env = serverEnv()
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return null
  return { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET }
}

/** `guest`: a guest teacher or moderator invited to this one lesson (no workspace data access). */
export type LiveRole = 'staff' | 'student' | 'guest'

export type LiveAccess =
  | {
      ok: true
      role: LiveRole
      window: LiveWindow
      session: { id: string; title: string; startsAt: string; durationMinutes: number; status: string; meetingUrl: string | null; workspaceId: string; groupId: string }
      groupName: string
      workspaceName: string
    }
  | { ok: false; reason: 'not_found' | 'cancelled' }

/**
 * Who may enter a lesson: staff who teach its group (or workspace managers), the group's current
 * students, and guests invited to this lesson with a guest link. Everyone else gets "not found".
 */
export async function resolveLiveAccess(admin: Db, userId: string, sessionId: string, now = new Date()): Promise<LiveAccess> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, reason: 'not_found' }
  const { data: s, error } = await admin
    .from('class_sessions')
    .select('id, title, starts_at, duration_minutes, status, meeting_url, workspace_id, group_id')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!s) return { ok: false, reason: 'not_found' }
  const m = await getMembership(admin, userId, s.workspace_id)
  let role: LiveRole | null = null
  if (m && isStaffRole(m.role) && (await teachableGroupIds(admin, m, userId)).has(s.group_id)) {
    role = 'staff'
  } else if (m && m.role === 'student') {
    const { data: gm, error: e2 } = await admin
      .from('group_members')
      .select('user_id')
      .eq('group_id', s.group_id)
      .eq('user_id', userId)
      .eq('role', 'student')
      .is('left_at', null)
      .maybeSingle()
    if (e2) throw e2
    if (gm) role = 'student'
  }
  if (!role) {
    // A guest invited to this lesson only.
    const { data: guest, error: e3 } = await admin.from('class_session_guests').select('role').eq('session_id', s.id).eq('user_id', userId).maybeSingle()
    if (e3) throw e3
    if (guest) role = 'guest'
  }
  if (!role) return { ok: false, reason: 'not_found' }
  if (s.status === 'cancelled') return { ok: false, reason: 'cancelled' }
  const [{ data: g }, { data: w }] = await Promise.all([
    admin.from('groups').select('name').eq('id', s.group_id).single(),
    admin.from('workspaces').select('name').eq('id', s.workspace_id).single(),
  ])
  return {
    ok: true,
    role,
    window: liveWindow(s.starts_at, s.duration_minutes, now),
    session: {
      id: s.id,
      title: s.title,
      startsAt: s.starts_at,
      durationMinutes: s.duration_minutes,
      status: s.status,
      meetingUrl: s.meeting_url,
      workspaceId: s.workspace_id,
      groupId: s.group_id,
    },
    groupName: g?.name ?? '',
    workspaceName: w?.name ?? '',
  }
}

/** Token valid for 3 hours, for this lesson's room only. Students cannot share their screen. */
export async function issueLiveToken(cfg: LiveConfig, input: { userId: string; name: string; role: LiveRole; sessionId: string }): Promise<string> {
  const at = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: input.userId,
    name: input.name.slice(0, 80),
    ttl: '3h',
    // Set by the server and signed into the token; clients cannot change it (no canUpdateOwnMetadata).
    // Guests teach in the room (board, screen) like staff, but are marked as guests and get no room admin.
    metadata: JSON.stringify(input.role === 'guest' ? { role: 'staff', guest: true } : { role: input.role }),
  })
  at.addGrant({
    roomJoin: true,
    room: liveRoomName(input.sessionId),
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    canPublishSources:
      input.role !== 'student'
        ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : [TrackSource.CAMERA, TrackSource.MICROPHONE],
    roomAdmin: input.role === 'staff',
  })
  return at.toJwt()
}

/** Records that a user received a token for a lesson (first/last time, count). Never blocks joining. */
export async function recordJoin(admin: Db, workspaceId: string, sessionId: string, userId: string): Promise<void> {
  try {
    const { data: existing } = await admin.from('session_joins').select('join_count').eq('session_id', sessionId).eq('user_id', userId).maybeSingle()
    if (existing) {
      await admin
        .from('session_joins')
        .update({ last_joined_at: new Date().toISOString(), join_count: Math.min(10000, existing.join_count + 1) })
        .eq('session_id', sessionId)
        .eq('user_id', userId)
    } else {
      await admin.from('session_joins').insert({ workspace_id: workspaceId, session_id: sessionId, user_id: userId })
    }
  } catch (err) {
    console.error('[live] could not record a join', err)
  }
}
