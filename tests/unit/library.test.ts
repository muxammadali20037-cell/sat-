import { describe, expect, it } from 'vitest'
import { libraryGroup, PROVIDER_DEFAULTS, validateResourceUrl } from '@/features/resources/rules'

describe('library shelves', () => {
  it('puts each resource on the right shelf, and leaves videos and tools off the shelves', () => {
    expect(libraryGroup({ provider: 'gutenberg', kind: 'book' })).toBe('classic')
    expect(libraryGroup({ provider: 'openstax', kind: 'book' })).toBe('textbook')
    expect(libraryGroup({ provider: 'college_board', kind: 'practice' })).toBe('official')
    expect(libraryGroup({ provider: 'khan_academy', kind: 'official_info' })).toBe('official')
    expect(libraryGroup({ provider: 'other', kind: 'article' })).toBe('grammar')
    expect(libraryGroup({ provider: 'youtube', kind: 'video' })).toBeNull()
    expect(libraryGroup({ provider: 'desmos', kind: 'tool' })).toBeNull()
    expect(libraryGroup({ provider: 'college_board', kind: 'video' })).toBeNull()
  })
  it('OpenStax and Project Gutenberg links must be on their own sites', () => {
    expect(validateResourceUrl('https://openstax.org/details/books/college-algebra-2e', 'openstax', null)).toBeNull()
    expect(validateResourceUrl('https://www.gutenberg.org/ebooks/1342', 'gutenberg', null)).toBeNull()
    expect(validateResourceUrl('https://example.com/ebooks/1342', 'gutenberg', null)).toBe('host_not_allowed')
    expect(validateResourceUrl('http://openstax.org/x', 'openstax', null)).toBe('https_only')
  })
  it('the usage terms say link only and name the licence', () => {
    expect(PROVIDER_DEFAULTS.openstax.usageTerms).toMatch(/Link only.*CC BY 4\.0/)
    expect(PROVIDER_DEFAULTS.gutenberg.usageTerms).toMatch(/Link only.*public-domain/)
  })
})
