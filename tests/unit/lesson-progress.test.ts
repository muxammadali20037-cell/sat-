import { describe, expect, it } from 'vitest'
import {
  completionThreshold,
  computeProgressUpdate,
  normalizeCompletionRatio,
  PROGRESS_RULES,
  type LessonKind,
  type PrevProgress,
  type ProgressEvent,
} from '@/features/lessons/progress'

const T0 = new Date('2026-11-02T10:00:00.000Z')
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

/** Feeds a sequence of reports through the function, persisting like the route does. */
function simulate(
  reports: Array<{ t: number; pos: number; event?: ProgressEvent }>,
  opts: { duration?: number; ratio?: number; kind?: LessonKind; start?: PrevProgress } = {},
) {
  let state: PrevProgress = opts.start ?? null
  let studySeconds = 0
  let completions = 0
  const results = []
  for (const r of reports) {
    const u = computeProgressUpdate(state, { positionSeconds: r.pos, event: r.event ?? 'heartbeat' }, at(r.t), opts.duration ?? 600, opts.ratio ?? 0.9, opts.kind ?? 'video')
    state = { lastPositionSeconds: u.lastPositionSeconds, watchedSeconds: u.watchedSeconds, lastHeartbeatAt: u.lastHeartbeatAt, completedAt: u.completedAt }
    studySeconds += u.creditedSeconds
    if (u.newlyCompleted) completions++
    results.push(u)
  }
  return { state: state!, studySeconds, completions, results, last: results[results.length - 1]! }
}

/** Honest viewer: play from `from` for `seconds`, heartbeat every 10 s at 1× speed. */
function honestPlayback(from: number, seconds: number, startT = 0) {
  const reports: Array<{ t: number; pos: number; event?: ProgressEvent }> = [{ t: startT, pos: from }]
  for (let s = 10; s <= seconds; s += 10) reports.push({ t: startT + s, pos: from + s })
  return reports
}

describe('completion threshold and ratio', () => {
  it('uses ceil(ratio × duration) and at least 1 second', () => {
    expect(completionThreshold(600, 0.9)).toBe(540)
    expect(completionThreshold(61, 0.9)).toBe(55)
    expect(completionThreshold(0, 0.9)).toBe(1)
  })

  it('falls back to 0.9 for invalid ratios', () => {
    expect(normalizeCompletionRatio(undefined)).toBe(0.9)
    expect(normalizeCompletionRatio(0)).toBe(0.9)
    expect(normalizeCompletionRatio(1.5)).toBe(0.9)
    expect(normalizeCompletionRatio(Number.NaN)).toBe(0.9)
    expect(normalizeCompletionRatio('0.8')).toBe(0.8)
    expect(normalizeCompletionRatio(1)).toBe(1)
  })
})

describe('computeProgressUpdate — honest playback', () => {
  it('first report sets the baseline without credit', () => {
    const u = computeProgressUpdate(null, { positionSeconds: 0, event: 'heartbeat' }, T0, 600, 0.9)
    expect(u).toMatchObject({ creditedSeconds: 0, watchedSeconds: 0, lastPositionSeconds: 0, accepted: true, completedAt: null })
    expect(u.lastHeartbeatAt).toEqual(T0)
  })

  it('a first report without a server baseline earns nothing, whatever the position', () => {
    const u = computeProgressUpdate(null, { positionSeconds: 300, event: 'ended' }, T0, 600, 0.9)
    expect(u.creditedSeconds).toBe(0)
    expect(u.lastPositionSeconds).toBe(300)
    expect(u.completedAt).toBeNull()
  })

  it('credits each 10 s heartbeat at 1× speed', () => {
    const { state, studySeconds } = simulate(honestPlayback(0, 120))
    expect(state.watchedSeconds).toBe(120)
    expect(studySeconds).toBe(120)
    expect(state.lastPositionSeconds).toBe(120)
  })

  it('allows 1.25× playback speed', () => {
    const { state } = simulate([
      { t: 0, pos: 0 },
      { t: 10, pos: 12 },
      { t: 20, pos: 25 },
    ])
    expect(state.watchedSeconds).toBe(25)
  })

  it('an honest full watch completes exactly once', () => {
    const { state, completions, results } = simulate(honestPlayback(0, 600))
    expect(state.completedAt).not.toBeNull()
    expect(completions).toBe(1)
    const firstComplete = results.findIndex((r) => r.newlyCompleted)
    expect(results[firstComplete]!.watchedSeconds).toBe(540)
  })

  it('resumes from a previous session without crediting the resume jump', () => {
    const start: PrevProgress = { lastPositionSeconds: 200, watchedSeconds: 200, lastHeartbeatAt: at(-86_400), completedAt: null }
    const { state } = simulate([...honestPlayback(200, 30, 0)], { start })
    expect(state.watchedSeconds).toBe(230)
  })
})

describe('computeProgressUpdate — seek-forward exploit', () => {
  it('seeking to the end earns only the wall-clock allowance and never completes', () => {
    const { state, studySeconds } = simulate([
      { t: 0, pos: 0 },
      { t: 10, pos: 10 },
      { t: 12, pos: 600, event: 'ended' }, // seek to end 2 s later → too soon, ignored
      { t: 20, pos: 600, event: 'ended' }, // credited by wall clock only
      { t: 30, pos: 600 },
      { t: 40, pos: 600 },
    ])
    // 10 honest seconds + min(590, 10×1.25+2, 30) = 14 for the jump interval; nothing after.
    expect(state.watchedSeconds).toBe(24)
    expect(studySeconds).toBe(24)
    expect(state.completedAt).toBeNull()
  })

  it('a long forward jump is capped at 30 s per report', () => {
    const { last } = simulate([
      { t: 0, pos: 0 },
      { t: 3600, pos: 400 },
    ])
    expect(last.creditedSeconds).toBe(PROGRESS_RULES.maxCreditSeconds)
  })

  it('repeated seeks cannot outpace the wall clock', () => {
    const reports = [{ t: 0, pos: 0 }]
    for (let i = 1; i <= 20; i++) reports.push({ t: i * 10, pos: Math.min(600, i * 60) })
    const { state } = simulate(reports)
    // 200 s of wall clock → at most 20 × 14 = 280 credited, far below 540.
    expect(state.watchedSeconds).toBeLessThanOrEqual(280)
    expect(state.completedAt).toBeNull()
  })

  it('bursts of reports are bounded at 1.65× real time', () => {
    const reports = [{ t: 0, pos: 0 }]
    for (let t = 5, pos = 100; t <= 300; t += 5, pos += 100) reports.push({ t, pos: Math.min(pos, 3000) })
    const { studySeconds } = simulate(reports, { duration: 3000 })
    expect(studySeconds).toBeLessThanOrEqual(300 * 1.65)
  })

  it('positions beyond the video length are clamped', () => {
    const u = computeProgressUpdate(
      { lastPositionSeconds: 590, watchedSeconds: 100, lastHeartbeatAt: T0, completedAt: null },
      { positionSeconds: 99_999, event: 'heartbeat' },
      at(10),
      600,
      0.9,
    )
    expect(u.lastPositionSeconds).toBe(600)
    expect(u.creditedSeconds).toBe(10)
  })

  it('treats non-finite positions as 0', () => {
    const u = computeProgressUpdate(
      { lastPositionSeconds: 50, watchedSeconds: 50, lastHeartbeatAt: T0, completedAt: null },
      { positionSeconds: Number.NaN, event: 'heartbeat' },
      at(10),
      600,
      0.9,
    )
    expect(u.creditedSeconds).toBe(0)
    expect(u.lastPositionSeconds).toBe(0)
  })
})

describe('computeProgressUpdate — replayed and rapid heartbeats', () => {
  it('an identical replayed heartbeat earns nothing', () => {
    const { results } = simulate([
      { t: 0, pos: 0 },
      { t: 10, pos: 10 },
      { t: 20, pos: 10 },
      { t: 30, pos: 10 },
    ])
    expect(results.map((r) => r.creditedSeconds)).toEqual([0, 10, 0, 0])
  })

  it('a replayed older heartbeat earns nothing and cannot double-count', () => {
    const { state } = simulate([
      { t: 0, pos: 0 },
      { t: 10, pos: 10 },
      { t: 20, pos: 20 },
      { t: 30, pos: 10 }, // replay of an earlier report
      { t: 40, pos: 30 }, // real playback continues at 30
    ])
    // 10 + 10 + 0 + min(20, 14.5, 30) = 34 ≤ 40 s of wall clock
    expect(state.watchedSeconds).toBe(34)
  })

  it('reports less than 5 s apart are ignored and keep the baseline', () => {
    const first = computeProgressUpdate(
      { lastPositionSeconds: 100, watchedSeconds: 100, lastHeartbeatAt: T0, completedAt: null },
      { positionSeconds: 104, event: 'heartbeat' },
      at(4),
      600,
      0.9,
    )
    expect(first).toMatchObject({ accepted: false, creditedSeconds: 0, lastPositionSeconds: 100, watchedSeconds: 100 })
    expect(first.lastHeartbeatAt).toEqual(T0)
    // The next regular report is credited for the whole interval.
    const next = computeProgressUpdate(
      { lastPositionSeconds: first.lastPositionSeconds, watchedSeconds: first.watchedSeconds, lastHeartbeatAt: first.lastHeartbeatAt, completedAt: null },
      { positionSeconds: 110, event: 'heartbeat' },
      at(10),
      600,
      0.9,
    )
    expect(next.creditedSeconds).toBe(10)
  })

  it('a server clock that went backwards credits nothing', () => {
    const u = computeProgressUpdate(
      { lastPositionSeconds: 100, watchedSeconds: 100, lastHeartbeatAt: at(60), completedAt: null },
      { positionSeconds: 110, event: 'heartbeat' },
      at(0),
      600,
      0.9,
    )
    expect(u.creditedSeconds).toBe(0)
  })
})

describe('computeProgressUpdate — pauses, rewinds and long gaps', () => {
  it('a pause followed by a long break credits only what is played after resuming', () => {
    const { state } = simulate([
      { t: 0, pos: 0 },
      { t: 10, pos: 10 },
      { t: 17, pos: 17, event: 'pause' },
      { t: 7200, pos: 17 }, // resume after two hours (play heartbeat)
      { t: 7210, pos: 27 },
    ])
    expect(state.watchedSeconds).toBe(27)
  })

  it('a long gap without a pause report is capped at 30 s', () => {
    const { last } = simulate([
      { t: 0, pos: 0 },
      { t: 10, pos: 10 },
      { t: 5000, pos: 120 }, // pause report lost, then a jump while paused
    ])
    expect(last.creditedSeconds).toBe(30)
  })

  it('rewinding earns nothing; re-watching forward is credited again', () => {
    const { results } = simulate([
      { t: 0, pos: 100 },
      { t: 10, pos: 110 },
      { t: 20, pos: 40 }, // rewind
      { t: 30, pos: 50 },
    ])
    expect(results.map((r) => r.creditedSeconds)).toEqual([0, 10, 0, 10])
  })
})

describe('computeProgressUpdate — completion boundary', () => {
  const near = (watched: number): PrevProgress => ({ lastPositionSeconds: watched, watchedSeconds: watched, lastHeartbeatAt: T0, completedAt: null })

  it('one second short of the threshold does not complete', () => {
    const u = computeProgressUpdate(near(530), { positionSeconds: 539, event: 'heartbeat' }, at(10), 600, 0.9)
    expect(u.watchedSeconds).toBe(539)
    expect(u.completedAt).toBeNull()
    expect(u.canComplete).toBe(false)
  })

  it('reaching the threshold exactly completes a video lesson', () => {
    const u = computeProgressUpdate(near(530), { positionSeconds: 540, event: 'heartbeat' }, at(10), 600, 0.9)
    expect(u.watchedSeconds).toBe(540)
    expect(u.completedAt).toEqual(at(10))
    expect(u.newlyCompleted).toBe(true)
  })

  it('stays completed without re-triggering, and caps watched at the duration', () => {
    const done: PrevProgress = { lastPositionSeconds: 590, watchedSeconds: 595, lastHeartbeatAt: T0, completedAt: at(-60) }
    const u = computeProgressUpdate(done, { positionSeconds: 600, event: 'ended' }, at(10), 600, 0.9)
    expect(u.watchedSeconds).toBe(600)
    expect(u.creditedSeconds).toBe(10) // still counts as study time
    expect(u.completedAt).toEqual(at(-60))
    expect(u.newlyCompleted).toBe(false)
  })

  it('respects a custom completion ratio', () => {
    const u = computeProgressUpdate(near(470), { positionSeconds: 480, event: 'heartbeat' }, at(10), 600, 0.8)
    expect(u.thresholdSeconds).toBe(480)
    expect(u.completedAt).not.toBeNull()
  })

  it('a video "complete" event before the threshold is rejected', () => {
    const u = computeProgressUpdate(near(100), { positionSeconds: 110, event: 'complete' }, at(10), 600, 0.9)
    expect(u.completedAt).toBeNull()
    expect(u.completeRejected).toBe(true)
  })
})

describe('computeProgressUpdate — text lessons', () => {
  const reading = (seconds: number, start = 0) => {
    const reports: Array<{ t: number; pos: number; event?: ProgressEvent }> = [{ t: 0, pos: start }]
    for (let s = 10; s <= seconds; s += 10) reports.push({ t: s, pos: start + s })
    return reports
  }

  it('accrues reading time but never completes on heartbeats alone', () => {
    const { state, last } = simulate(reading(300), { duration: 240, kind: 'text' })
    expect(state.watchedSeconds).toBe(240)
    expect(last.canComplete).toBe(true)
    expect(state.completedAt).toBeNull()
  })

  it('rejects "complete" before the reading threshold', () => {
    const { last, state } = simulate([...reading(100), { t: 110, pos: 110, event: 'complete' }], { duration: 240, kind: 'text' })
    expect(last.completeRejected).toBe(true)
    expect(state.completedAt).toBeNull()
  })

  it('accepts "complete" once the threshold is met, even right after a heartbeat', () => {
    const { last, completions } = simulate([...reading(220), { t: 222, pos: 222, event: 'complete' }], { duration: 240, kind: 'text' })
    expect(last.accepted).toBe(false) // too soon to earn time…
    expect(last.completedAt).toEqual(at(222)) // …but the threshold was already met
    expect(completions).toBe(1)
  })

  it('a reading counter that restarts at 0 on a new visit earns nothing until it advances', () => {
    const start: PrevProgress = { lastPositionSeconds: 120, watchedSeconds: 120, lastHeartbeatAt: at(-3600), completedAt: null }
    const { results } = simulate(
      [
        { t: 0, pos: 0 },
        { t: 10, pos: 10 },
      ],
      { duration: 240, kind: 'text', start },
    )
    expect(results.map((r) => r.creditedSeconds)).toEqual([0, 10])
  })

  it('the reading counter is not clamped to the estimated reading time', () => {
    const u = computeProgressUpdate(
      { lastPositionSeconds: 300, watchedSeconds: 240, lastHeartbeatAt: T0, completedAt: at(-1) },
      { positionSeconds: 310, event: 'heartbeat' },
      at(10),
      240,
      0.9,
      'text',
    )
    expect(u.lastPositionSeconds).toBe(310)
    expect(u.creditedSeconds).toBe(10)
    expect(u.watchedSeconds).toBe(240)
  })
})
