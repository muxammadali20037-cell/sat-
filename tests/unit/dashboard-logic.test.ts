import { describe, expect, it } from 'vitest'
import {
  currentWeek,
  estimatePoints,
  examCountdown,
  isActiveDay,
  latestEstimate,
  resultHref,
  scalePercent,
  taskHref,
} from '@/features/dashboard/logic'
import { formatLessonLength, formatStudyDuration, formatTimestamp, percent } from '@/features/dashboard/format'

const day = (date: string, study = 0, questions = 0, lessons = 0) => ({
  activity_date: date,
  study_seconds: study,
  questions_answered: questions,
  lessons_completed: lessons,
})

describe('streak week', () => {
  it('uses the same activity rule as SQL activity_streak', () => {
    expect(isActiveDay(day('x', 59))).toBe(false)
    expect(isActiveDay(day('x', 60))).toBe(true)
    expect(isActiveDay(day('x', 0, 1))).toBe(true)
    expect(isActiveDay(day('x', 0, 0, 1))).toBe(true)
  })

  it('returns Monday → Sunday for the current week with today and future flags', () => {
    // 2026-11-04 is a Wednesday.
    const week = currentWeek('2026-11-04', [day('2026-11-02', 600), day('2026-11-03', 30), day('2026-10-31', 600)])
    expect(week.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    expect(week.map((d) => d.active)).toEqual([true, false, false, false, false, false, false])
    expect(week.findIndex((d) => d.isToday)).toBe(2)
    expect(week.filter((d) => d.isFuture)).toHaveLength(4)
  })

  it('treats Sunday as the last day of the week', () => {
    const week = currentWeek('2026-11-08', [])
    expect(week[0]!.date).toBe('2026-11-02')
    expect(week[6]).toMatchObject({ date: '2026-11-08', isToday: true })
  })
})

describe('examCountdown', () => {
  it('handles unset, upcoming, today and passed', () => {
    expect(examCountdown(null, '2026-11-02')).toEqual({ state: 'unset' })
    expect(examCountdown('not-a-date', '2026-11-02')).toEqual({ state: 'unset' })
    expect(examCountdown('2026-12-05', '2026-11-02')).toEqual({ state: 'upcoming', date: '2026-12-05', days: 33, weeks: 4 })
    expect(examCountdown('2026-11-02', '2026-11-02')).toEqual({ state: 'today', date: '2026-11-02' })
    expect(examCountdown('2026-10-30', '2026-11-02')).toEqual({ state: 'passed', date: '2026-10-30', daysAgo: 3 })
  })
})

describe('score estimates', () => {
  const rows = [
    { id: 'b', kind: 'mock_exam', completed_at: '2026-10-20T10:00:00Z', rw_estimate_low: 560, rw_estimate_high: 640, math_estimate_low: 520, math_estimate_high: 600 },
    { id: 'a', kind: 'mock_exam', completed_at: '2026-10-01T10:00:00Z', rw_estimate_low: 500, rw_estimate_high: 580, math_estimate_low: null, math_estimate_high: null },
    { id: 'c', kind: 'practice', completed_at: '2026-10-25T10:00:00Z', rw_estimate_low: null, rw_estimate_high: null, math_estimate_low: null, math_estimate_high: null },
    { id: 'd', kind: 'mock_exam', completed_at: null, rw_estimate_low: 600, rw_estimate_high: 680, math_estimate_low: 600, math_estimate_high: 680 },
  ]

  it('keeps completed attempts with an estimate, chronologically, with totals only when both sections exist', () => {
    const points = estimatePoints(rows)
    expect(points.map((p) => p.attemptId)).toEqual(['a', 'b'])
    expect(points[0]!.total).toBeNull()
    expect(points[1]!.total).toEqual({ low: 1080, high: 1240, mid: 1160 })
    expect(points[1]!.rw).toEqual({ low: 560, high: 640, mid: 600 })
  })

  it('latest estimate per section', () => {
    const latest = latestEstimate(estimatePoints(rows))
    expect(latest.rw).toMatchObject({ low: 560, at: '2026-10-20T10:00:00Z' })
    expect(latest.math).toMatchObject({ low: 520 })
    expect(latest.total).toMatchObject({ mid: 1160 })
    expect(latestEstimate([])).toEqual({ rw: null, math: null, total: null })
  })

  it('places scores on a scale', () => {
    expect(scalePercent(1000, 400, 1600)).toBe(50)
    expect(scalePercent(200, 400, 1600)).toBe(0)
    expect(scalePercent(1700, 400, 1600)).toBe(100)
  })
})

describe('links', () => {
  it('maps study plan tasks to their targets', () => {
    const base = { domain_id: null, skill_id: null, lesson_id: null, mock_exam_id: null }
    expect(taskHref({ ...base, task_type: 'lesson', lesson_id: 'L1' })).toBe('/dashboard/lesson/L1')
    expect(taskHref({ ...base, task_type: 'lesson' })).toBe('/dashboard/courses')
    expect(taskHref({ ...base, task_type: 'practice', subject_code: 'math', domain_id: 'D', skill_id: 'K' })).toBe(
      '/dashboard/practice?subject=math&domain=D&skill=K',
    )
    expect(taskHref({ ...base, task_type: 'review', subject_code: 'reading_writing', domain_id: 'D' })).toBe(
      '/dashboard/practice?subject=reading_writing&domain=D',
    )
    expect(taskHref({ ...base, task_type: 'practice' })).toBe('/dashboard/practice')
    expect(taskHref({ ...base, task_type: 'mock_exam', mock_exam_id: 'M1' })).toBe('/dashboard/mock-exams/M1')
    expect(taskHref({ ...base, task_type: 'diagnostic' })).toBe('/dashboard/diagnostic')
  })

  it('maps results by attempt kind', () => {
    expect(resultHref('mock_exam', 'A')).toBe('/dashboard/mock-exams/results/A')
    expect(resultHref('practice', 'A')).toBe('/dashboard/results/A')
    expect(resultHref('diagnostic', 'A')).toBe('/dashboard/results/A')
  })
})

describe('format helpers', () => {
  const units = { h: 'h', min: 'min', s: 's' }
  it('formats durations and timestamps', () => {
    expect(formatStudyDuration(3725, units)).toBe('1 h 2 min')
    expect(formatStudyDuration(3600, units)).toBe('1 h')
    expect(formatStudyDuration(2700, units)).toBe('45 min')
    expect(formatStudyDuration(40, units)).toBe('40 s')
    expect(formatLessonLength(601, units)).toBe('11 min')
    expect(formatLessonLength(45, units)).toBe('45 s')
    expect(formatTimestamp(272)).toBe('4:32')
    expect(formatTimestamp(3725)).toBe('1:02:05')
    expect(percent(0.876)).toBe('88%')
    expect(percent(null)).toBe('—')
  })
})
