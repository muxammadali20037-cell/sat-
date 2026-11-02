import { describe, expect, it } from 'vitest'
import { DeleteBookmarkQuery, ToggleBookmarkSchema } from '@/features/bookmarks/schemas'

const ID = '0b5c2c55-7f6b-4c38-9a8e-2b1a4c1f7d10'

describe('ToggleBookmarkSchema', () => {
  it('accepts exactly one target', () => {
    expect(ToggleBookmarkSchema.safeParse({ questionId: ID }).success).toBe(true)
    expect(ToggleBookmarkSchema.safeParse({ lessonId: ID }).success).toBe(true)
  })
  it('rejects both targets, none, extra fields and bad ids', () => {
    expect(ToggleBookmarkSchema.safeParse({ questionId: ID, lessonId: ID }).success).toBe(false)
    expect(ToggleBookmarkSchema.safeParse({}).success).toBe(false)
    expect(ToggleBookmarkSchema.safeParse({ questionId: ID, userId: ID }).success).toBe(false)
    expect(ToggleBookmarkSchema.safeParse({ questionId: 'x' }).success).toBe(false)
  })
})

describe('DeleteBookmarkQuery', () => {
  it('requires a uuid', () => {
    expect(DeleteBookmarkQuery.safeParse({ id: ID }).success).toBe(true)
    expect(DeleteBookmarkQuery.safeParse({ id: '1 or 1=1' }).success).toBe(false)
  })
})
