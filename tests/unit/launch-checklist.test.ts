import { describe, expect, it } from 'vitest'
import { buildLaunchChecklist, distinctMocksPossible, launchSummary, type LaunchInputs } from '@/features/admin/launch-checklist'

const base: LaunchInputs = {
  siteUrl: 'https://sat-iota-nine.vercel.app/',
  desmosKey: true,
  anthropicKey: false,
  clickConfigured: false,
  paymeConfigured: false,
  telegramToken: true,
  telegramWebhookOk: false,
  googleEnabled: false,
  referralDays: 0,
  publishedQuestions: { math: 760, reading_writing: 440 },
  unpublishedPacks: [{ id: 'core-v5', unpublished: 352 }],
  publishedMocks: 3,
  draftMocks: 0,
  publishedLessons: 30,
}
const byId = (i: LaunchInputs) => Object.fromEntries(buildLaunchChecklist(i).map((x) => [x.id, x]))

describe('launch checklist', () => {
  it('things the app cannot see are never shown as done', () => {
    const all = byId({ ...base, clickConfigured: true, anthropicKey: true, telegramWebhookOk: true, googleEnabled: true, referralDays: 7, unpublishedPacks: [], siteUrl: 'https://satmaster.uz/' })
    for (const id of ['smtp', 'vercel-pro', 'legal', 'leaked-passwords', 'pilot']) expect(all[id].status).toBe('manual')
    expect(all.desmos.status).toBe('manual')
  })
  it('detects what it can', () => {
    const a = byId(base)
    expect(a.payments.status).toBe('todo')
    expect(a.packs.status).toBe('todo')
    expect(a.packs.why).toContain('core-v5 (352 ta)')
    expect(a.domain.status).toBe('todo')
    expect(a.telegram.status).toBe('todo')
    const b = byId({ ...base, paymeConfigured: true, unpublishedPacks: [], siteUrl: 'https://satmaster.uz/', telegramWebhookOk: true, desmosKey: false })
    expect(b.payments.status).toBe('done')
    expect(b.payments.why).toContain('Payme')
    expect(b.packs.status).toBe('done')
    expect(b.domain.status).toBe('done')
    expect(b.telegram.status).toBe('done')
    expect(b.desmos.status).toBe('done')
  })
  it('Telegram that cannot be reached is not "done"', () => {
    expect(byId({ ...base, telegramWebhookOk: null }).telegram.status).toBe('todo')
  })
  it('distinct mocks are limited by the smaller section', () => {
    expect(distinctMocksPossible({ math: 760, reading_writing: 440 })).toBe(5)
    expect(distinctMocksPossible({ math: 760, reading_writing: 792 })).toBe(9)
    expect(distinctMocksPossible({ math: 0, reading_writing: 792 })).toBe(0)
  })
  it('summary counts open must-do items', () => {
    const s = launchSummary(buildLaunchChecklist(base))
    expect(s.mustOpen).toBe(6)
    expect(s.total).toBe(buildLaunchChecklist(base).length)
  })
})
