'use client'

import { useSyncExternalStore } from 'react'

/**
 * A ticking wall clock shared by every subscriber (timer, break countdown). Display-only: the
 * server is authoritative, and callers add the server offset from the last API response.
 */
let current = 0
const listeners = new Set<() => void>()
let interval: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!interval) {
    current = Date.now()
    interval = setInterval(() => {
      current = Date.now()
      for (const l of listeners) l()
    }, 250)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && interval) {
      clearInterval(interval)
      interval = null
    }
  }
}

const getSnapshot = () => current
const getServerSnapshot = () => 0

/** Milliseconds since epoch, refreshed 4× per second (0 during SSR). */
export function useClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Whole seconds until `targetIso` given the client clock and the server offset (never negative). */
export function secondsUntil(targetIso: string | null, nowMs: number, offsetMs: number): number {
  if (!targetIso || nowMs === 0) return 0
  return Math.max(0, Math.ceil((Date.parse(targetIso) - (nowMs + offsetMs)) / 1000))
}

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeMedia(listener: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', listener)
  return () => mql.removeEventListener('change', listener)
}

/** True on ≥ 1024px screens (desktop exam layout). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeMedia,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  )
}
