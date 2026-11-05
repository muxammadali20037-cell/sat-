import { describe, expect, it } from 'vitest'
import { drillCallback, itemMessage, parseDrillCallback, plainText, questionItem, suitableQuestion, wordItem } from '@/features/telegram/drill-build'
import { getEntry, allEntries } from '@/features/vocab/dictionary'
import { linkCheckTarget, youtubeVideoId } from '@/features/resources/link-check'

const q = (over: Partial<Parameters<typeof suitableQuestion>[0]> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  questionType: 'multiple_choice',
  imagePath: null,
  stem: 'Which choice completes the text?',
  passage: 'The **first** results were ______.',
  options: [
    { content: 'ambiguous', isCorrect: true },
    { content: 'famous', isCorrect: false },
    { content: 'permanent', isCorrect: false },
    { content: 'loud', isCorrect: false },
  ],
  ...over,
})

describe('telegram drill items', () => {
  it('keeps only short text multiple-choice questions with one correct answer', () => {
    expect(suitableQuestion(q())).toBe(true)
    expect(suitableQuestion(q({ imagePath: 'x.png' }))).toBe(false)
    expect(suitableQuestion(q({ questionType: 'student_produced_response' }))).toBe(false)
    expect(suitableQuestion(q({ stem: 'Solve $x^2=4$' }))).toBe(false)
    expect(suitableQuestion(q({ passage: 'x'.repeat(1500) }))).toBe(false)
    expect(suitableQuestion(q({ options: q().options.map((o) => ({ ...o, isCorrect: true })) }))).toBe(false)
  })
  it('a question item keeps the right answer after shuffling and strips formatting', () => {
    for (let i = 0; i < 20; i++) {
      const it = questionItem(q(), 'Because **although** signals contrast.')
      expect(it.choices[it.correctIndex]).toBe('ambiguous')
      expect(it.body).toContain('The first results')
      expect(it.explanation).toBe('Because although signals contrast.')
    }
  })
  it('a word item has the translation among four distinct choices', () => {
    const others = allEntries().slice(0, 8).map(([, e]) => e)
    const it = wordItem('resilient', getEntry('resilient')!, others, 'uz')
    expect(it.choices).toHaveLength(4)
    expect(new Set(it.choices).size).toBe(4)
    expect(it.choices[it.correctIndex]).toBe(getEntry('resilient')!.uz)
    const en = wordItem('resilient', getEntry('resilient')!, others, 'en')
    expect(en.choices[en.correctIndex]).toBe(getEntry('resilient')!.def)
  })
  it('callback data round-trips and rejects anything else', () => {
    const id = '0b9f2a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
    expect(drillCallback(id, 2).length).toBeLessThanOrEqual(64)
    expect(parseDrillCallback(drillCallback(id, 2))).toEqual({ itemId: id, choice: 2 })
    for (const bad of ['dr:x:1', `dr:${id}:4`, `lg:ok:${id}`, undefined]) expect(parseDrillCallback(bad)).toBeNull()
  })
  it('message lists lettered choices', () => {
    expect(itemMessage('Q?', ['a', 'b'])).toBe('Q?\n\nA) a\nB) b')
    expect(plainText('- one\n- **two**')).toBe('• one\n• two')
  })
})

describe('YouTube link checks', () => {
  it('finds the video id in common link shapes', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=kz_P_b3H0oA')).toBe('kz_P_b3H0oA')
    expect(youtubeVideoId('https://youtu.be/kz_P_b3H0oA')).toBe('kz_P_b3H0oA')
    expect(youtubeVideoId('https://m.youtube.com/shorts/kz_P_b3H0oA')).toBe('kz_P_b3H0oA')
    expect(youtubeVideoId('https://www.youtube.com/@channel')).toBeNull()
    expect(youtubeVideoId('https://example.com/watch?v=kz_P_b3H0oA')).toBeNull()
  })
  it('checks YouTube through oEmbed (a removed video answers 404 there, not 200)', () => {
    expect(linkCheckTarget('https://youtu.be/kz_P_b3H0oA')).toBe('https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dkz_P_b3H0oA')
    expect(linkCheckTarget('https://bluebook.collegeboard.org/')).toBe('https://bluebook.collegeboard.org/')
  })
})
