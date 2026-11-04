/**
 * Challenges and the opt-in leaderboard: effort-based points from real activity rows, the week
 * window, ranking with ties, challenge progress and timing, input bounds.
 */
import { describe, expect, it } from 'vitest'
import {
  challengeTiming,
  CreateChallengeSchema,
  inRange,
  metricValue,
  progress,
  rankEntries,
  weekRange,
  weeklyPoints,
  type ActivityRow,
} from '@/features/classroom/challenges'

const row = (date: string, over: Partial<ActivityRow> = {}): ActivityRow => ({
  user_id: 'u',
  activity_date: date,
  study_seconds: 0,
  questions_answered: 0,
  correct_answers: 0,
  lessons_completed: 0,
  ...over,
})

describe('challenge maths', () => {
  it('week runs Monday to Sunday', () => {
    expect(weekRange('2026-11-04')).toEqual({ from: '2026-11-02', to: '2026-11-08' }) // Wednesday
    expect(weekRange('2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' }) // Sunday
    expect(weekRange('2026-11-09')).toEqual({ from: '2026-11-09', to: '2026-11-15' }) // Monday
  })
  it('metrics come from activity rows; idle days do not count as active', () => {
    const rows = [row('2026-11-02', { correct_answers: 12, questions_answered: 15, study_seconds: 900 }), row('2026-11-03', { study_seconds: 30 }), row('2026-11-04', { lessons_completed: 1, study_seconds: 600 })]
    expect(metricValue('correct_answers', rows)).toBe(12)
    expect(metricValue('study_minutes', rows)).toBe(25)
    expect(metricValue('active_days', rows)).toBe(2)
    expect(weeklyPoints(rows, 1)).toEqual({ correct: 12, activeDays: 2, classWork: 1, points: 12 + 20 + 20 })
  })
  it('date ranges are inclusive', () => {
    const rows = [row('2026-11-01'), row('2026-11-02'), row('2026-11-08'), row('2026-11-09')]
    expect(inRange(rows, '2026-11-02', '2026-11-08').map((r) => r.activity_date)).toEqual(['2026-11-02', '2026-11-08'])
  })
  it('ranking: ties share a rank, zero-point students are left out', () => {
    const base = { correct: 0, activeDays: 0, classWork: 0, self: false }
    const r = rankEntries([
      { ...base, studentId: 'a', name: 'Ali', points: 50 },
      { ...base, studentId: 'b', name: 'Bek', points: 70 },
      { ...base, studentId: 'c', name: 'Cho', points: 50 },
      { ...base, studentId: 'd', name: 'Dil', points: 0 },
    ])
    expect(r.map((e) => [e.name, e.rank])).toEqual([
      ['Bek', 1],
      ['Ali', 2],
      ['Cho', 2],
    ])
  })
  it('progress caps at 100% and timing follows the dates', () => {
    expect(progress(150, 100)).toEqual({ value: 150, target: 100, ratio: 1, done: true })
    expect(challengeTiming('2026-11-05', '2026-11-12', '2026-11-04', 'active')).toBe('upcoming')
    expect(challengeTiming('2026-11-01', '2026-11-12', '2026-11-04', 'active')).toBe('running')
    expect(challengeTiming('2026-11-01', '2026-11-03', '2026-11-04', 'active')).toBe('finished')
    expect(challengeTiming('2026-11-01', '2026-11-12', '2026-11-04', 'ended')).toBe('finished')
  })
  it('input: valid range up to 92 days, bounded target', () => {
    const base = { workspaceId: '11111111-1111-4111-8111-111111111111', groupId: '22222222-2222-4222-8222-222222222222', title: '1000 answers', metric: 'correct_answers', mode: 'group', target: 1000, startsOn: '2026-11-04', endsOn: '2026-11-30' }
    expect(CreateChallengeSchema.safeParse(base).success).toBe(true)
    expect(CreateChallengeSchema.safeParse({ ...base, endsOn: '2026-11-01' }).success).toBe(false)
    expect(CreateChallengeSchema.safeParse({ ...base, endsOn: '2027-03-01' }).success).toBe(false)
    expect(CreateChallengeSchema.safeParse({ ...base, target: 0 }).success).toBe(false)
    expect(CreateChallengeSchema.safeParse({ ...base, metric: 'score' }).success).toBe(false)
  })
})
