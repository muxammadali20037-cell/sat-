'use client'

import * as React from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api/client'
import { format } from '@/lib/i18n/dict'
import { useDict } from '@/lib/i18n/client'
import { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { formatTimestamp } from '@/features/dashboard/format'
import type { PlaybackSource } from '@/lib/video/types'
import type { LessonView, ProgressResponse } from '@/features/lessons/types'
import { cn } from '@/lib/utils'

export type CaptionTrack = { src: string; srcLang: string; label: string; default?: boolean }

type HeartbeatEvent = 'heartbeat' | 'pause' | 'ended'

const HEARTBEAT_MS = 10_000
const PRE_SEEK_MIN_GAP_MS = 5_000

/** Sends a progress report; `beacon` survives page hide/unload. */
export async function sendProgress(
  lessonId: string,
  body: { positionSeconds: number; event: HeartbeatEvent | 'complete' },
  options: { beacon?: boolean } = {},
): Promise<ProgressResponse | null> {
  const payload = { positionSeconds: Math.max(0, Math.floor(body.positionSeconds)), event: body.event }
  const url = `/api/lessons/${lessonId}/progress`
  if (options.beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: 'application/json' }))
    return null
  }
  return apiFetch<ProgressResponse>(url, { method: 'POST', body: payload })
}

/**
 * Lesson video: native <video> (HLS through hls.js where needed, loaded on demand), resume from
 * the last position, server heartbeats every 10 s while playing and on play/pause/ended/seek/hide.
 * Native controls stay keyboard accessible; extra shortcuts on the focused player.
 */
export function VideoPlayer({
  lessonId,
  title,
  source: initialSource,
  startAt,
  captions = [],
  onProgress,
}: {
  lessonId: string
  title: string
  source: PlaybackSource
  startAt: number
  captions?: CaptionTrack[]
  onProgress?: (p: ProgressResponse) => void
}) {
  const t = useDict(coursesDict)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [source, setSource] = React.useState(initialSource)
  const [error, setError] = React.useState<'load' | 'expired' | null>(null)
  const [saveError, setSaveError] = React.useState(false)
  const [resumedFrom, setResumedFrom] = React.useState<number | null>(null)
  const resumeAt = React.useRef(startAt)
  const lastTime = React.useRef(startAt)
  const lastPreSeek = React.useRef(0)
  const onProgressRef = React.useRef(onProgress)
  React.useEffect(() => {
    onProgressRef.current = onProgress
  }, [onProgress])

  const report = React.useCallback(
    async (event: HeartbeatEvent, position?: number, beacon = false) => {
      const video = videoRef.current
      if (!video) return
      try {
        const result = await sendProgress(lessonId, { positionSeconds: position ?? video.currentTime, event }, { beacon })
        if (result) {
          setSaveError(false)
          onProgressRef.current?.(result)
        }
      } catch {
        setSaveError(true)
      }
    },
    [lessonId],
  )

  // Attach the source (hls.js only when the browser cannot play HLS natively).
  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let destroyed = false
    let hls: { destroy: () => void } | null = null
    setError(null)

    const expired = () => Date.now() >= new Date(source.expiresAt).getTime() - 30_000
    const fail = () => setError(expired() ? 'expired' : 'load')

    if (source.kind === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (destroyed) return
          if (!Hls.isSupported()) {
            fail()
            return
          }
          const instance = new Hls({ startPosition: resumeAt.current > 0 ? resumeAt.current : -1 })
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) fail()
          })
          instance.loadSource(source.url)
          instance.attachMedia(video)
          hls = instance
        })
        .catch(fail)
    } else {
      video.src = source.url
    }
    const onError = () => fail()
    video.addEventListener('error', onError)
    return () => {
      destroyed = true
      video.removeEventListener('error', onError)
      hls?.destroy()
      if (!hls) {
        video.removeAttribute('src')
        video.load()
      }
    }
  }, [source])

  // Resume position once metadata is known.
  const onLoadedMetadata = () => {
    const video = videoRef.current
    if (!video) return
    const at = resumeAt.current
    if (at > 5 && Number.isFinite(video.duration) && at < video.duration - 5) {
      if (Math.abs(video.currentTime - at) > 1) video.currentTime = at
      setResumedFrom(at)
    }
  }

  // Heartbeats while playing; a final report when the page is hidden.
  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let timer: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onPlay = () => {
      void report('heartbeat')
      stop()
      timer = setInterval(() => void report('heartbeat'), HEARTBEAT_MS)
    }
    const onPause = () => {
      stop()
      if (!video.ended) void report('pause')
    }
    const onEnded = () => {
      stop()
      void report('ended')
    }
    const onTimeUpdate = () => {
      if (!video.seeking) lastTime.current = video.currentTime
    }
    // Report the pre-seek position so time skipped by seeking is never credited.
    const onSeeking = () => {
      const now = Date.now()
      if (now - lastPreSeek.current < PRE_SEEK_MIN_GAP_MS) return
      lastPreSeek.current = now
      void report('heartbeat', lastTime.current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !video.paused) void report('pause', undefined, true)
    }
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('seeking', onSeeking)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)
    return () => {
      stop()
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('seeking', onSeeking)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
    }
  }, [report])

  const reload = async () => {
    const video = videoRef.current
    resumeAt.current = video && video.currentTime > 0 ? video.currentTime : lastTime.current
    try {
      const view = await apiFetch<LessonView>(`/api/lessons/${lessonId}`)
      if (view.playback) setSource(view.playback)
      else setError('load')
    } catch {
      setError('load')
    }
  }

  // Keyboard shortcuts on the focused player (native controls remain available).
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const video = videoRef.current
    if (!video || e.altKey || e.ctrlKey || e.metaKey) return
    const target = e.target as HTMLElement
    if (target.tagName === 'BUTTON' || target.tagName === 'A') return
    const key = e.key.toLowerCase()
    if (key === ' ' || key === 'k') {
      e.preventDefault()
      if (video.paused) void video.play()
      else video.pause()
    } else if (key === 'j' || key === 'arrowleft') {
      e.preventDefault()
      video.currentTime = Math.max(0, video.currentTime - 10)
    } else if (key === 'l' || key === 'arrowright') {
      e.preventDefault()
      video.currentTime = Math.min(video.duration || video.currentTime, video.currentTime + 10)
    } else if (key === 'f') {
      e.preventDefault()
      if (document.fullscreenElement) void document.exitFullscreen()
      else void video.requestFullscreen?.()
    } else if (key === 'c' && video.textTracks.length > 0) {
      e.preventDefault()
      const track = video.textTracks[0]!
      track.mode = track.mode === 'showing' ? 'hidden' : 'showing'
    }
  }

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-navy-900"
        onKeyDown={onKeyDown}
        role="group"
        aria-label={format(t.player.label, { title })}
      >
        <video
          ref={videoRef}
          className="aspect-video w-full bg-black"
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          onLoadedMetadata={onLoadedMetadata}
          aria-label={format(t.player.label, { title })}
        >
          {captions.map((c) => (
            <track key={c.src} kind="captions" src={c.src} srcLang={c.srcLang} label={c.label} default={c.default} />
          ))}
        </video>
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-900/90 p-6 text-center text-sm text-white">
            <p>{error === 'expired' ? t.lesson.videoExpired : t.lesson.videoError}</p>
            <Button size="sm" variant="secondary" onClick={() => void reload()}>
              <RotateCcw aria-hidden />
              {t.lesson.reload}
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <p className="hidden sm:block">{t.player.keyboardHint}</p>
        {resumedFrom !== null && (
          <p className="flex items-center gap-2">
            {format(t.player.resumeFrom, { time: formatTimestamp(resumedFrom) })}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                const video = videoRef.current
                if (video) video.currentTime = 0
                setResumedFrom(null)
              }}
            >
              {t.player.startOver}
            </button>
          </p>
        )}
      </div>
      <p role="status" aria-live="polite" className={cn('text-xs text-destructive', !saveError && 'sr-only')}>
        {saveError ? t.lesson.progressError : ''}
      </p>
    </div>
  )
}
