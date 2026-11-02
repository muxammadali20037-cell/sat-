'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { toast } from '@/components/ui/toast'
import { format } from '@/lib/i18n/dict'
import { useDict, useLocale } from '@/lib/i18n/client'
import { coursesDict } from '@/lib/i18n/dictionaries/courses'
import { formatDate, formatStudyDuration } from '@/features/dashboard/format'
import type { PlaybackSource } from '@/lib/video/types'
import type { LessonProgressView, ProgressResponse } from '@/features/lessons/types'
import { sendProgress, VideoPlayer } from './video-player'

type ProgressState = { watched: number; threshold: number; canComplete: boolean; completedAt: string | null }

const ACTIVE_WINDOW_MS = 60_000
const HEARTBEAT_EVERY_S = 10

function useReadingTracker(lessonId: string, enabled: boolean, startAt: number, onResult: (p: ProgressResponse) => void) {
  const counter = React.useRef(startAt)
  const lastActivity = React.useRef(0)
  const [saveError, setSaveError] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) return
    lastActivity.current = Date.now()
    const markActive = () => {
      lastActivity.current = Date.now()
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const
    for (const e of events) window.addEventListener(e, markActive, { passive: true })

    const beat = async (event: 'heartbeat' | 'pause', beacon = false) => {
      try {
        const res = await sendProgress(lessonId, { positionSeconds: counter.current, event }, { beacon })
        if (res) {
          setSaveError(false)
          onResult(res)
        }
      } catch {
        setSaveError(true)
      }
    }

    // Baseline on open, then the counter advances only while the page is visible and the
    // student has interacted within the last minute.
    void beat('heartbeat')
    let sinceBeat = 0
    const tick = setInterval(() => {
      const visible = document.visibilityState === 'visible'
      const active = Date.now() - lastActivity.current < ACTIVE_WINDOW_MS
      if (!visible || !active) return
      counter.current += 1
      sinceBeat += 1
      if (sinceBeat >= HEARTBEAT_EVERY_S) {
        sinceBeat = 0
        void beat('heartbeat')
      }
    }, 1000)
    const onHide = () => {
      if (document.visibilityState === 'hidden') void beat('pause', true)
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(tick)
      for (const e of events) window.removeEventListener(e, markActive)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [enabled, lessonId, onResult])

  return { counter, saveError }
}

/**
 * The study area of a lesson: the video player (video lessons) or the notes with a reading-time
 * tracker (text lessons), plus the server-confirmed completion state.
 */
export function LessonStudy({
  lessonId,
  title,
  kind,
  playback,
  progress,
  timeZone,
  notes,
}: {
  lessonId: string
  title: string
  kind: 'video' | 'text'
  playback: PlaybackSource | null
  progress: LessonProgressView
  timeZone: string
  /** Server-rendered notes (text lessons are read inside the tracker). */
  notes?: React.ReactNode
}) {
  const t = useDict(coursesDict)
  const locale = useLocale()
  const router = useRouter()
  const [state, setState] = React.useState<ProgressState>({
    watched: progress.watchedSeconds,
    threshold: progress.thresholdSeconds,
    canComplete: progress.canComplete,
    completedAt: progress.completedAt,
  })
  const [completing, setCompleting] = React.useState(false)

  const onResult = React.useCallback(
    (p: ProgressResponse) => {
      setState({ watched: p.watchedSeconds, threshold: p.thresholdSeconds, canComplete: p.canComplete, completedAt: p.completedAt })
      if (p.newlyCompleted) {
        toast.success(t.lesson.markedComplete)
        router.refresh()
      }
    },
    [router, t.lesson.markedComplete],
  )

  const isText = kind === 'text'
  const tracker = useReadingTracker(lessonId, isText && !state.completedAt, progress.lastPositionSeconds, onResult)

  const markComplete = async () => {
    setCompleting(true)
    try {
      const res = await sendProgress(lessonId, { positionSeconds: tracker.counter.current, event: 'complete' })
      if (res) {
        onResult(res)
        if (res.completeRejected) toast.error(t.lesson.completeTooEarly)
      }
    } catch {
      toast.error(t.lesson.progressError)
    } finally {
      setCompleting(false)
    }
  }

  const units = t.units
  const progressText = format(isText ? t.lesson.readingProgress : t.lesson.videoProgress, {
    watched: formatStudyDuration(Math.min(state.watched, state.threshold), units),
    threshold: formatStudyDuration(state.threshold, units),
  })

  return (
    <div className="space-y-4">
      {kind === 'video' && playback && (
        <VideoPlayer lessonId={lessonId} title={title} source={playback} startAt={progress.completedAt ? 0 : progress.lastPositionSeconds} onProgress={onResult} />
      )}
      {isText && notes}

      <div className="rounded-lg border border-border bg-card p-4" aria-live="polite">
        {state.completedAt ? (
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="size-5 text-success" aria-hidden />
            {format(t.lesson.completedOn, { date: formatDate(state.completedAt, locale, timeZone) })}
          </p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t.lesson.notCompleted}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{progressText}</p>
              <ProgressBar value={Math.min(state.watched, state.threshold)} max={state.threshold} size="sm" className="mt-2 max-w-sm" label={progressText} />
              <p className="mt-2 text-xs text-muted-foreground">
                {isText ? format(t.lesson.readRule, { time: formatStudyDuration(state.threshold, units) }) : t.lesson.watchRule}
              </p>
            </div>
            {isText && (
              <Button onClick={() => void markComplete()} disabled={!state.canComplete} loading={completing} className="self-start sm:self-auto">
                {t.lesson.markComplete}
              </Button>
            )}
          </div>
        )}
        {tracker.saveError && <p className="mt-2 text-xs text-destructive">{t.lesson.progressError}</p>}
      </div>
    </div>
  )
}
