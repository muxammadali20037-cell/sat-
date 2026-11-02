/**
 * Safe rich-text tokenizer for question stems, passages, explanations and lesson notes.
 * Supported syntax (nothing else is interpreted — HTML is always literal text):
 *   blank line            → paragraph break; single newline → line break
 *   $$ … $$               → display math (KaTeX)
 *   $ … $                 → inline math (KaTeX); write \$ for a literal dollar sign
 *   **bold**  *italic*  __underline__
 *   "- " at line start    → bullet list item
 *   | a | b |             → table: a header row, a separator row (| --- | ---: |), then body rows.
 *   |---|---|               Use \| for a literal pipe; math may contain | (e.g. $|x|$).
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'underline'; children: InlineNode[] }
  | { type: 'break' }

export type BlockNode =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'display_math'; value: string }
  | { type: 'list'; items: InlineNode[][] }
  | { type: 'table'; align: TableAlign[]; header: InlineNode[][]; rows: InlineNode[][][] }

export type TableAlign = 'left' | 'center' | 'right' | null

/** Every inline run inside a block (paragraph, list items, table cells) — for walkers such as KaTeX checks. */
export function blockInlines(block: BlockNode): InlineNode[][] {
  switch (block.type) {
    case 'paragraph':
      return [block.children]
    case 'list':
      return block.items
    case 'table':
      return [...block.header, ...block.rows.flat()]
    case 'display_math':
      return []
  }
}

/** Every math expression in parsed rich text (inline and display), in document order. */
export function collectMath(blocks: BlockNode[]): string[] {
  const out: string[] = []
  const walk = (nodes: InlineNode[]) => {
    for (const n of nodes) {
      if (n.type === 'math') out.push(n.value)
      else if ('children' in n) walk(n.children)
    }
  }
  for (const b of blocks) {
    if (b.type === 'display_math') out.push(b.value)
    else blockInlines(b).forEach(walk)
  }
  return out
}

const DOLLAR_PLACEHOLDER = '\u0000DOLLAR\u0000'

export function parseRichText(source: string): BlockNode[] {
  const text = (source ?? '').replace(/\r\n?/g, '\n').replace(/\\\$/g, DOLLAR_PLACEHOLDER)
  const blocks: BlockNode[] = []

  // Split out display math first so it can span lines.
  const segments = text.split(/\$\$([\s\S]+?)\$\$/g)
  segments.forEach((segment, index) => {
    if (index % 2 === 1) {
      blocks.push({ type: 'display_math', value: segment.trim() })
      return
    }
    for (const para of segment.split(/\n{2,}/)) {
      const trimmed = para.replace(/^\n+|\n+$/g, '')
      if (!trimmed.trim()) continue
      const lines = trimmed.split('\n')
      const table = parseTable(lines)
      if (table) {
        blocks.push(table)
      } else if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        blocks.push({ type: 'list', items: lines.map((l) => parseInline(l.replace(/^\s*[-•]\s+/, ''))) })
      } else {
        const children: InlineNode[] = []
        lines.forEach((line, i) => {
          if (i > 0) children.push({ type: 'break' })
          children.push(...parseInline(line))
        })
        blocks.push({ type: 'paragraph', children })
      }
    }
  })
  return blocks
}

const restoreDollars = (s: string) => s.split(DOLLAR_PLACEHOLDER).join('$')

const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEPARATOR = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/
const PIPE_PLACEHOLDER = '\u0002'

/** Split one "| a | b |" row into cells. Pipes inside $math$ and escaped \| are not separators. */
function splitRow(line: string): string[] {
  const protectedLine = line
    .replace(/\\\|/g, PIPE_PLACEHOLDER)
    .replace(/\$[^$\n]+?\$/g, (m) => m.replace(/\|/g, PIPE_PLACEHOLDER))
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
  return protectedLine.split('|').map((cell) => cell.split(PIPE_PLACEHOLDER).join('|').trim())
}

/** A block is a table when every line is a |row|, the second line is the separator, and there is a header. */
function parseTable(lines: string[]): BlockNode | null {
  if (lines.length < 2 || !TABLE_SEPARATOR.test(lines[1]!) || !lines.every((l) => TABLE_ROW.test(l))) return null
  const align: TableAlign[] = splitRow(lines[1]!).map((c) => {
    const left = c.startsWith(':')
    const right = c.endsWith(':')
    return left && right ? 'center' : right ? 'right' : left ? 'left' : null
  })
  const width = align.length
  const fit = (cells: string[]) => Array.from({ length: width }, (_, i) => parseInline(cells[i] ?? ''))
  return {
    type: 'table',
    align,
    header: fit(splitRow(lines[0]!)),
    rows: lines.slice(2).map((l) => fit(splitRow(l))),
  }
}

const MATH_TOKEN = /\u0001(\d+)\u0001/g

/**
 * Inline math is protected first (its content is opaque to emphasis parsing and may contain * or _),
 * then emphasis is parsed over the whole line — so **bold** and *italic* may contain $math$.
 */
export function parseInline(input: string): InlineNode[] {
  const maths: string[] = []
  const protectedText = input
    .replace(/\\\$/g, DOLLAR_PLACEHOLDER)
    .replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => `\u0001${maths.push(restoreDollars(tex)) - 1}\u0001`)
  return parseEmphasis(protectedText, maths)
}

function textAndMath(input: string, maths: string[]): InlineNode[] {
  const out: InlineNode[] = []
  let last = 0
  for (const m of input.matchAll(MATH_TOKEN)) {
    if (m.index! > last) out.push({ type: 'text', value: restoreDollars(input.slice(last, m.index)) })
    out.push({ type: 'math', value: maths[Number(m[1])] ?? '' })
    last = m.index! + m[0].length
  }
  if (last < input.length) out.push({ type: 'text', value: restoreDollars(input.slice(last)) })
  return out
}

const EMPHASIS: Array<{ re: RegExp; type: 'bold' | 'underline' | 'italic' }> = [
  { re: /\*\*([^*]+?)\*\*/, type: 'bold' },
  { re: /__([^_]+?)__/, type: 'underline' },
  { re: /\*([^*\s][^*]*?)\*/, type: 'italic' },
]

function parseEmphasis(input: string, maths: string[]): InlineNode[] {
  let best: { index: number; length: number; inner: string; type: 'bold' | 'underline' | 'italic' } | null = null
  for (const { re, type } of EMPHASIS) {
    const m = re.exec(input)
    if (m && (best === null || m.index < best.index)) best = { index: m.index, length: m[0].length, inner: m[1]!, type }
  }
  if (!best) return textAndMath(input, maths)
  const before = input.slice(0, best.index)
  const after = input.slice(best.index + best.length)
  return [...textAndMath(before, maths), { type: best.type, children: parseEmphasis(best.inner, maths) }, ...parseEmphasis(after, maths)]
}

/** Plain-text rendering (for search snippets, AI prompts, notifications). */
export function richTextToPlain(source: string): string {
  return (source ?? '')
    .replace(/\$\$([\s\S]+?)\$\$/g, ' $1 ')
    .replace(/\*\*|__/g, '')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/\s+\n/g, '\n')
    .trim()
}

/** Readable plain text for LaTeX snippets (previews, excerpts): \frac{a}{b} → a/b, \sqrt{x} → √(x). */
export function latexToPlain(tex: string): string {
  let s = tex
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/\^\{([^{}]*)\}/g, '^$1')
      .replace(/_\{([^{}]*)\}/g, '_$1')
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
  }
  return s
    // Drop parentheses around single-token parts: (2x - 1)/(3) → (2x - 1)/3, (a)/(b) → a/b.
    .replace(/\((\w+)\)\//g, '$1/')
    .replace(/\/\((\w+)\)/g, '/$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\le(q)?/g, '≤')
    .replace(/\\ge(q)?/g, '≥')
    .replace(/\\neq?/g, '≠')
    .replace(/\\pi/g, 'π')
    .replace(/\\theta/g, 'θ')
    .replace(/\\circ/g, '°')
    .replace(/\\pm/g, '±')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/\^\{([^{}]*)\}/g, '^$1')
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** One-line readable excerpt of rich text (math converted, formatting markers removed). */
export function richTextExcerpt(source: string, max = 120): string {
  const text = (source ?? '')
    // Tables: drop separator rows, read cells as "a, b".
    .replace(/^[ \t]*\|([ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*$/gm, '')
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_m, cells: string) => cells.trim().split(/\s*\|\s*/).filter(Boolean).join(', ') + '.')
    .replace(/\\\$/g, '\u0000')
    .replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, (_m, display: string | undefined, inline: string | undefined) => latexToPlain(display ?? inline ?? ''))
    .replace(/\u0000/g, '$')
    .replace(/\*\*|__/g, '')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/^- /gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}
