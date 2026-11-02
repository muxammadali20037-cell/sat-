/** Client-safe video types (no server imports). */

export type VideoProvider = 'bunny' | 'supabase'

/**
 * A short-lived playback source for one lesson video.
 * - `hls`: an HLS playlist (play with hls.js, or natively on Safari/iOS)
 * - `file`: a progressive file (mp4/webm) for a plain <video src>
 */
export type PlaybackSource = {
  kind: 'hls' | 'file'
  url: string
  /** ISO timestamp after which the URL stops working. */
  expiresAt: string
}

export function isVideoProvider(value: unknown): value is VideoProvider {
  return value === 'bunny' || value === 'supabase'
}
