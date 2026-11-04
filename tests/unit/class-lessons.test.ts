/**
 * PHASE 4-A: lesson inputs, weekly series, lesson timing, attendance maths, group analytics,
 * file rules for class materials, and the mission item for today's lesson.
 */
import { describe, expect, it } from 'vitest'
import {
  AddLinkMaterialSchema,
  checkMaterialFile,
  CreateSessionSchema,
  groupAnalytics,
  MarkAttendanceSchema,
  materialPath,
  pathBelongsTo,
  sessionTiming,
  summarizeAttendance,
  weeklyStarts,
} from '@/features/classroom/lessons'
import { can } from '@/features/classroom/permissions'
import { buildMission, type MissionInput } from '@/features/dashboard/today'

const W = '11111111-1111-4111-8111-111111111111'
const G = '22222222-2222-4222-8222-222222222222'
const F = '33333333-3333-4333-8333-333333333333'

describe('lesson inputs', () => {
  const base = { workspaceId: W, groupId: G, title: 'Algebra review', startsAt: '2026-11-05T14:00:00+05:00', durationMinutes: 90 }
  it('accepts a lesson with an https meeting link and bounded repeats', () => {
    expect(CreateSessionSchema.parse({ ...base, meetingUrl: 'https://meet.google.com/abc-defg-hij', repeatWeeks: 4 }).repeatWeeks).toBe(4)
    expect(CreateSessionSchema.parse(base).meetingUrl).toBeNull()
  })
  it('rejects unsafe or out-of-range values', () => {
    for (const bad of [
      { meetingUrl: 'http://zoom.us/j/1' },
      { meetingUrl: 'javascript:alert(1)' },
      { meetingUrl: 'https://user:pw@zoom.us/' },
      { durationMinutes: 5 },
      { durationMinutes: 600 },
      { repeatWeeks: 30 },
      { startsAt: 'tomorrow' },
      { title: 'x' },
    ]) {
      expect(CreateSessionSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false)
    }
    expect(AddLinkMaterialSchema.safeParse({ workspaceId: W, groupId: G, title: 'Notes', url: 'ftp://x.org/a' }).success).toBe(false)
    expect(MarkAttendanceSchema.safeParse({ workspaceId: W, sessionId: G, marks: [{ studentId: F, status: 'sleeping' }] }).success).toBe(false)
  })
  it('a weekly series keeps the same time each week', () => {
    expect(weeklyStarts('2026-11-05T09:00:00.000Z', 3)).toEqual(['2026-11-05T09:00:00.000Z', '2026-11-12T09:00:00.000Z', '2026-11-19T09:00:00.000Z'])
  })
  it('timing: live from 10 minutes before the start until the end', () => {
    const start = '2026-11-05T10:00:00Z'
    expect(sessionTiming(start, 60, new Date('2026-11-05T09:40:00Z'))).toBe('upcoming')
    expect(sessionTiming(start, 60, new Date('2026-11-05T09:51:00Z'))).toBe('live')
    expect(sessionTiming(start, 60, new Date('2026-11-05T10:59:00Z'))).toBe('live')
    expect(sessionTiming(start, 60, new Date('2026-11-05T11:00:00Z'))).toBe('ended')
  })
})

describe('attendance and analytics', () => {
  it('late counts as attended; excused is left out of the rate', () => {
    expect(summarizeAttendance(['present', 'late', 'absent', 'excused'])).toMatchObject({ rate: 2 / 3, excused: 1, marked: 4 })
    expect(summarizeAttendance(['excused']).rate).toBeNull()
    expect(summarizeAttendance([]).rate).toBeNull()
  })
  it('group analytics counts only current students and practice/written work', () => {
    const a = groupAnalytics({
      studentIds: ['s1', 's2'],
      attendance: [
        { student_id: 's1', status: 'present' },
        { student_id: 's2', status: 'absent' },
        { student_id: 'gone', status: 'present' },
      ],
      assignments: [
        { id: 'a1', kind: 'practice', points: null, assignee_id: null, status: 'published' },
        { id: 'a2', kind: 'text', points: 20, assignee_id: 's1', status: 'published' },
        { id: 'a3', kind: 'mock_exam', points: null, assignee_id: null, status: 'published' },
        { id: 'a4', kind: 'text', points: 10, assignee_id: null, status: 'draft' },
      ],
      submissions: [
        { assignment_id: 'a1', student_id: 's1', status: 'submitted', score: 80 },
        { assignment_id: 'a1', student_id: 's2', status: 'started', score: null },
        { assignment_id: 'a2', student_id: 's1', status: 'graded', score: 10 },
        { assignment_id: 'a1', student_id: 'gone', status: 'submitted', score: 100 },
      ],
    })
    expect(a.students).toBe(2)
    expect(a.attendance.rate).toBe(0.5)
    expect(a.completion).toEqual({ done: 2, expected: 3, rate: 2 / 3 })
    expect(a.averageScore.count).toBe(2)
    expect(a.averageScore.value).toBeCloseTo((0.8 + 0.5) / 2)
  })
  it('an empty group reports no data instead of zeros', () => {
    const a = groupAnalytics({ studentIds: [], attendance: [], assignments: [], submissions: [] })
    expect(a.attendance.rate).toBeNull()
    expect(a.completion.rate).toBeNull()
    expect(a.averageScore.value).toBeNull()
  })
})

describe('class materials', () => {
  it('only PDF and images up to 20 MB', () => {
    expect(checkMaterialFile({ type: 'application/pdf', size: 1000 })).toBeNull()
    expect(checkMaterialFile({ type: 'application/x-msdownload', size: 1000 })).toBe('type')
    expect(checkMaterialFile({ type: 'image/svg+xml', size: 1000 })).toBe('type')
    expect(checkMaterialFile({ type: 'image/png', size: 21 * 1024 * 1024 })).toBe('size')
  })
  it('a storage path is bound to its workspace and group', () => {
    const path = materialPath(W, G, F, 'pdf')
    expect(pathBelongsTo(path, W, G)).toBe(true)
    expect(pathBelongsTo(path, W, F)).toBe(false)
    expect(pathBelongsTo(`ws/${W}/${G}/../../${F}.pdf`, W, G)).toBe(false)
  })
  it('teachers and assistants of the group manage lessons; students never', () => {
    expect(can('teacher', 'session.manage', { teachesGroup: true })).toBe(true)
    expect(can('assistant', 'attendance.mark', { teachesGroup: true })).toBe(true)
    expect(can('teacher', 'material.manage', { teachesGroup: false })).toBe(false)
    expect(can('admin', 'material.manage')).toBe(true)
    expect(can('student', 'attendance.mark', { teachesGroup: true })).toBe(false)
  })
})

describe('daily mission', () => {
  const base: MissionInput = {
    planTasks: [],
    hasCompletedDiagnostic: true,
    diagnosticToday: false,
    questionsAvailable: true,
    focusSkill: null,
    lesson: null,
    mistakes: null,
    retryCompletedToday: false,
    today: { studySeconds: 0, questionsAnswered: 0, lessonsCompleted: 0 },
    dailyStudyMinutes: null,
  }
  it("today's class lesson comes first, before class work", () => {
    const m = buildMission({ ...base, classLessons: [{ title: 'Algebra review', time: '14:00', group: 'SAT A' }], classWork: [{ id: 'a', title: 'Essay', personal: false }] })
    expect(m.items.map((i) => i.kind)).toEqual(['class_lesson', 'class_work'])
  })
})
