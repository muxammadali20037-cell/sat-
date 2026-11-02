import { describe, expect, it } from 'vitest'
import { parseInline, parseRichText, richTextToPlain } from '@/lib/rich-text/tokenize'

describe('parseRichText', () => {
  it('treats HTML as literal text (never markup)', () => {
    const blocks = parseRichText('<script>alert(1)</script> and <b>bold</b>')
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', value: '<script>alert(1)</script> and <b>bold</b>' }] },
    ])
  })

  it('splits paragraphs on blank lines and keeps single newlines as breaks', () => {
    const blocks = parseRichText('First line\nsecond line\n\nNew paragraph')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: 'First line' }, { type: 'break' }, { type: 'text', value: 'second line' }],
    })
  })

  it('extracts display math across lines and inline math', () => {
    const blocks = parseRichText('Solve $2x = 6$.\n\n$$\nx = \\frac{6}{2}\n$$')
    expect(blocks[0]).toEqual({
      type: 'paragraph',
      children: [{ type: 'text', value: 'Solve ' }, { type: 'math', value: '2x = 6' }, { type: 'text', value: '.' }],
    })
    expect(blocks[1]).toEqual({ type: 'display_math', value: 'x = \\frac{6}{2}' })
  })

  it('supports escaped dollar signs', () => {
    expect(parseInline('It costs \\$5 and \\$7')).toEqual([{ type: 'text', value: 'It costs $5 and $7' }])
  })

  it('parses emphasis including underline used for SAT "underlined portion" items', () => {
    expect(parseInline('The __underlined phrase__ is **key**, *really*.')).toEqual([
      { type: 'text', value: 'The ' },
      { type: 'underline', children: [{ type: 'text', value: 'underlined phrase' }] },
      { type: 'text', value: ' is ' },
      { type: 'bold', children: [{ type: 'text', value: 'key' }] },
      { type: 'text', value: ', ' },
      { type: 'italic', children: [{ type: 'text', value: 'really' }] },
      { type: 'text', value: '.' },
    ])
  })

  it('does not treat math contents as emphasis', () => {
    expect(parseInline('$a*b*c$')).toEqual([{ type: 'math', value: 'a*b*c' }])
  })

  it('builds bullet lists', () => {
    expect(parseRichText('- one\n- two')).toEqual([
      { type: 'list', items: [[{ type: 'text', value: 'one' }], [{ type: 'text', value: 'two' }]] },
    ])
  })
})

describe('richTextToPlain', () => {
  it('strips markup for prompts and snippets', () => {
    expect(richTextToPlain('**Bold** and __under__ with $x$')).toBe('Bold and under with $x$')
  })
})

describe('richTextExcerpt', async () => {
  const { richTextExcerpt, latexToPlain } = await import('@/lib/rich-text/tokenize')
  it('turns inline LaTeX into readable text', () => {
    expect(richTextExcerpt('If $\\frac{3}{4}x + 2 = 11$, what is $x$?')).toBe('If 3/4x + 2 = 11, what is x?')
    expect(latexToPlain('\\sqrt{x^{2}+1} \\le 2\\pi')).toBe('√(x^2+1) ≤ 2π')
  })
  it('keeps escaped dollars and strips formatting', () => {
    expect(richTextExcerpt('It costs \\$5 and **bold** text')).toBe('It costs $5 and bold text')
  })
  it('truncates with an ellipsis', () => {
    expect(richTextExcerpt('a'.repeat(50), 10)).toBe('aaaaaaaaa…')
  })
})
