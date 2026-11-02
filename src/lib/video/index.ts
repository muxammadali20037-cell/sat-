import 'server-only'
import { ApiError } from '@/lib/api/errors'
import { serverEnv } from '@/lib/env'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { bunnyStreamPlaylistUrl } from './bunny'
import type { PlaybackSource, VideoProvider } from './types'

export type { PlaybackSource, VideoProvider } from './types'
export { isVideoProvider } from './types'

/** Playback URLs live for 2 hours (SYSTEM_ARCHITECTURE §7). The player re-fetches on expiry. */
export const PLAYBACK_TTL_SECONDS = 2 * 60 * 60

const SUPABASE_VIDEO_BUCKET = 'lesson-videos'

function notConfigured(provider: VideoProvider, detail: string): ApiError {
  return new ApiError(503, 'PROVIDER_NOT_CONFIGURED', 'Video playback is not configured for this deployment yet.', {
    provider,
    detail,
  })
}

function fileKind(assetId: string): PlaybackSource['kind'] {
  return /\.m3u8$/i.test(assetId) ? 'hls' : 'file'
}

/**
 * Short-lived playback source for a lesson video. Call ONLY after the entitlement check.
 * `assetId` comes from lesson_contents.video_asset_id (never sent to the browser on its own).
 *
 * - bunny: Bunny Stream video GUID → token-signed HLS playlist (BUNNY_STREAM_CDN_HOST, BUNNY_STREAM_TOKEN_KEY)
 * - supabase: object path in the private `lesson-videos` bucket → signed URL
 *
 * Throws ApiError 503 PROVIDER_NOT_CONFIGURED when credentials are missing — never a fake URL.
 */
export async function getPlaybackSource(
  provider: VideoProvider,
  assetId: string,
  now: Date = new Date(),
): Promise<PlaybackSource> {
  const expiresUnix = Math.floor(now.getTime() / 1000) + PLAYBACK_TTL_SECONDS
  const expiresAt = new Date(expiresUnix * 1000).toISOString()

  if (provider === 'bunny') {
    const env = serverEnv()
    const host = env.BUNNY_STREAM_CDN_HOST
    const key = env.BUNNY_STREAM_TOKEN_KEY
    if (!host || !key) throw notConfigured('bunny', 'BUNNY_STREAM_CDN_HOST and BUNNY_STREAM_TOKEN_KEY are required')
    return {
      kind: 'hls',
      url: bunnyStreamPlaylistUrl({ host, securityKey: key, videoId: assetId, expires: expiresUnix }),
      expiresAt,
    }
  }

  // Supabase Storage (development / small files)
  const admin = createAdminSupabase()
  const { data, error } = await admin.storage.from(SUPABASE_VIDEO_BUCKET).createSignedUrl(assetId, PLAYBACK_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    console.error('[video] supabase signed url failed', { assetId, error: error?.message })
    throw notConfigured('supabase', 'The video file could not be signed from the lesson-videos bucket')
  }
  return { kind: fileKind(assetId), url: data.signedUrl, expiresAt }
}
