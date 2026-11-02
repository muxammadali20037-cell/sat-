import { describe, expect, it } from 'vitest'
import { collectMath, parseInline, parseRichText, richTextExcerpt, richTextToPlain } from '@/lib/rich-text/tokenize'

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

describe('emphasis around inline math', async () => {
  const { parseInline } = await import('@/lib/rich-text/tokenize')
  it('parses italic and bold that contain math', () => {
    expect(parseInline('*What is $x$?*')).toEqual([{ type: 'italic', children: [{ type: 'text', value: 'What is ' }, { type: 'math', value: 'x' }, { type: 'text', value: '?' }] }])
    expect(parseInline('**$x$ first:** rest')).toEqual([
      { type: 'bold', children: [{ type: 'math', value: 'x' }, { type: 'text', value: ' first:' }] },
      { type: 'text', value: ' rest' },
    ])
  })
  it('keeps * and _ inside math opaque', () => {
    expect(parseInline('$a*b$ and $x_1$ *ok*')).toEqual([
      { type: 'math', value: 'a*b' },
      { type: 'text', value: ' and ' },
      { type: 'math', value: 'x_1' },
      { type: 'text', value: ' ' },
      { type: 'italic', children: [{ type: 'text', value: 'ok' }] },
    ])
  })

  describe('tables', () => {
    const src = ['**Wheat yield (t/ha)**', '', '| Variety | Dry year | Wet year |', '| --- | ---: | :---: |', '| K-7 | 3.4 | $4.6$ |', '| L-2 | 2.0 |'].join('\n')

    it('parses header, alignment, rows and pads short rows', () => {
      const blocks = parseRichText(src)
      expect(blocks[0]!.type).toBe('paragraph')
      const t = blocks[1]!
      expect(t.type).toBe('table')
      if (t.type !== 'table') return
      expect(t.align).toEqual([null, 'right', 'center'])
      expect(t.header).toEqual([[{ type: 'text', value: 'Variety' }], [{ type: 'text', value: 'Dry year' }], [{ type: 'text', value: 'Wet year' }]])
      expect(t.rows[0]![2]).toEqual([{ type: 'math', value: '4.6' }])
      expect(t.rows[1]).toHaveLength(3)
      expect(t.rows[1]![2]).toEqual([])
    })

    it('keeps pipes inside math and escaped pipes inside one cell', () => {
      const t = parseRichText('| x | value |\n| --- | --- |\n| $|x - 2|$ | a \\| b |')[0]!
      if (t.type !== 'table') throw new Error('expected a table')
      expect(t.rows[0]![0]).toEqual([{ type: 'math', value: '|x - 2|' }])
      expect(t.rows[0]![1]).toEqual([{ type: 'text', value: 'a | b' }])
    })

    it('needs a separator row; otherwise the lines stay a paragraph', () => {
      expect(parseRichText('| a | b |\n| c | d |')[0]!.type).toBe('paragraph')
    })

    it('collects math from table cells and makes readable excerpts', () => {
      expect(collectMath(parseRichText(src))).toEqual(['4.6'])
      expect(richTextExcerpt('| Year | Otters |\n| --- | ---: |\n| 2014 | 0 |')).toBe('Year, Otters. 2014, 0.')
    })
  })
})

