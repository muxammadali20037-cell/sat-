'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch, ApiClientError } from '@/lib/api/client'
import type { SaveAnswerResultDTO } from '@/features/exams/types'

export type AnswerPayload = {
  selectedOptionId: string | null
  responseText: string | null
  markedForReview: boolean
  timeSpentSeconds: number
}

export type QueueStatus = { kind: 'idle' | 'saving' | 'saved' | 'error'; pending: number }

type Handlers = {
  onSaved: (result: SaveAnswerResultDTO) => void
  /** 409 TIME_EXPIRED / CONFLICT or a validation error: the answer was rejected for good. */
  onRejected: (error: ApiClientError) => void
}

const isRetryable = (err: unknown) =>
  !(err instanceof ApiClientError) || err.status === 0 || err.status === 429 || err.status >= 500

/**
 * Serial, latest-wins save queue for exam answers. Optimistic: the UI shows the local answer
 * immediately; this queue keeps retrying network failures with backoff until they reach the
 * server, and `flush()` lets the submit flow wait until every answer is saved.
 */
export function useAnswerQueue(attemptId: string | null, handlers: Handlers) {
  const pending = useRef(new Map<string, AnswerPayload>())
  const debounce = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const running = useRef<Promise<void> | null>(null)
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failures = useRef(0)
  const attemptRef = useRef(attemptId)
  const handlersRef = useRef(handlers)
  const [status, setStatus] = useState<QueueStatus>({ kind: 'idle', pending: 0 })
  const drainRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    attemptRef.current = attemptId
    handlersRef.current = handlers
  })

  const drain = useCallback(async (): Promise<void> => {
    if (running.current) return running.current
    if (retry.current) {
      clearTimeout(retry.current)
      retry.current = null
    }
    const run = (async () => {
      while (pending.current.size > 0) {
        const attempt = attemptRef.current
        if (!attempt) return
        const [aqId, payload] = pending.current.entries().next().value as [string, AnswerPayload]
        pending.current.delete(aqId)
        setStatus({ kind: 'saving', pending: pending.current.size + 1 })
        try {
          const result = await apiFetch<SaveAnswerResultDTO>('/api/exams/answer', {
            body: { attemptId: attempt, attemptQuestionId: aqId, ...payload },
          })
          failures.current = 0
          handlersRef.current.onSaved(result)
        } catch (err) {
          if (isRetryable(err)) {
            if (!pending.current.has(aqId)) pending.current.set(aqId, payload) // keep newer edits if any
            failures.current += 1
            setStatus({ kind: 'error', pending: pending.current.size })
            const delay = Math.min(15_000, 1000 * 2 ** Math.min(failures.current, 4))
            retry.current = setTimeout(() => void drainRef.current(), delay)
            return
          }
          handlersRef.current.onRejected(err as ApiClientError)
        }
      }
      setStatus({ kind: 'saved', pending: 0 })
    })()
    running.current = run
    try {
      await run
    } finally {
      running.current = null
    }
  }, [])

  useEffect(() => {
    drainRef.current = drain
  }, [drain])

  /** Queue the latest state of a question. `debounceMs` batches fast typing (SPR). */
  const enqueue = useCallback(
    (attemptQuestionId: string, payload: AnswerPayload, debounceMs = 0) => {
      pending.current.set(attemptQuestionId, payload)
      setStatus((s) => ({ kind: s.kind === 'error' ? 'error' : 'saving', pending: pending.current.size }))
      const existing = debounce.current.get(attemptQuestionId)
      if (existing) clearTimeout(existing)
      if (debounceMs > 0) {
        debounce.current.set(
          attemptQuestionId,
          setTimeout(() => {
            debounce.current.delete(attemptQuestionId)
            void drain()
          }, debounceMs),
        )
      } else {
        debounce.current.delete(attemptQuestionId)
        void drain()
      }
    },
    [drain],
  )

  /** Sends everything now. Resolves true when nothing is left unsaved. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (const t of debounce.current.values()) clearTimeout(t)
    debounce.current.clear()
    if (running.current) await running.current
    await drain()
    return pending.current.size === 0
  }, [drain])

  /** Drop everything (module finished: the server no longer accepts answers for it). */
  const reset = useCallback(() => {
    for (const t of debounce.current.values()) clearTimeout(t)
    debounce.current.clear()
    pending.current.clear()
    if (retry.current) clearTimeout(retry.current)
    retry.current = null
    failures.current = 0
    setStatus({ kind: 'idle', pending: 0 })
  }, [])

  const pendingCount = useCallback(() => pending.current.size, [])

  useEffect(() => {
    const onOnline = () => void drain()
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('online', onOnline)
      if (retry.current) clearTimeout(retry.current)
    }
  }, [drain])

  return { enqueue, flush, reset, status, pendingCount }
}
