/** Client-safe lesson payload shapes (GET /api/lessons/[id] and the lesson page). */
import type { PlaybackSource } from '@/lib/video/types'
import type { SubjectCode } from '@/types/questions'
import type { LessonKind } from '@/features/courses/catalog'

export type LessonResourceView = {
  id: string
  title: string
  kind: 'link' | 'file'
  /** null when the file is locked (not entitled) or could not be signed. */
  url: string | null
  locked: boolean
}

export type LessonProgressView = {
  watchedSeconds: number
  lastPositionSeconds: number
  completedAt: string | null
  thresholdSeconds: number
  canComplete: boolean
}

export type LessonNeighbor = { id: string; title: string; kind: LessonKind; durationSeconds: number }

export type LessonView = {
  id: string
  title: string
  description: string
  objectives: string[]
  kind: LessonKind
  durationSeconds: number
  isFreePreview: boolean
  course: { id: string; title: string; subjectCode: SubjectCode; subjectName: string; href: string }
  domain: { id: string; name: string } | null
  skill: { id: string; name: string } | null
  /** True when the student's plan does not include this lesson (no body, no playback). */
  locked: boolean
  /** Lesson notes (safe rich text); only when entitled. */
  body: string | null
  /** Signed playback source; only when entitled and the provider is configured. */
  playback: PlaybackSource | null
  /** Why `playback` is null for an entitled video lesson. */
  playbackError: { code: 'PROVIDER_NOT_CONFIGURED' | 'MEDIA_MISSING'; message: string } | null
  resources: LessonResourceView[]
  progress: LessonProgressView
  completionRatio: number
  prev: LessonNeighbor | null
  next: LessonNeighbor | null
  bookmarked: boolean
  practiceHref: string | null
}

export type ProgressResponse = {
  watchedSeconds: number
  lastPositionSeconds: number
  thresholdSeconds: number
  canComplete: boolean
  completed: boolean
  completedAt: string | null
  newlyCompleted: boolean
  completeRejected: boolean
  creditedSeconds: number
}
