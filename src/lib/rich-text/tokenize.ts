/**
 * Safe rich-text tokenizer for question stems, passages, explanations and lesson notes.
 * Supported syntax (nothing else is interpreted — HTML is always literal text):
 *   blank line            → paragraph break; single newline → line break
 *   $$ … $$               → display math (KaTeX)
 *   $ … $                 → inline math (KaTeX); write \$ for a literal dollar sign
 *   **bold**  *italic*  __underline__
 *   "- " at line start    → bullet list item
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
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
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

export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = []
  // Inline math first (content is opaque to emphasis parsing). Escaped \$ never opens math.
  const parts = input.replace(/\\\$/g, DOLLAR_PLACEHOLDER).split(/\$([^$\n]+?)\$/g)
  parts.forEach((part, i) => {
    if (i % 2 === 1) nodes.push({ type: 'math', value: restoreDollars(part) })
    else if (part) nodes.push(...parseEmphasis(part))
  })
  return nodes
}

const EMPHASIS: Array<{ re: RegExp; type: 'bold' | 'underline' | 'italic' }> = [
  { re: /\*\*([^*]+?)\*\*/, type: 'bold' },
  { re: /__([^_]+?)__/, type: 'underline' },
  { re: /\*([^*\s][^*]*?)\*/, type: 'italic' },
]

function parseEmphasis(input: string): InlineNode[] {
  let best: { index: number; length: number; inner: string; type: 'bold' | 'underline' | 'italic' } | null = null
  for (const { re, type } of EMPHASIS) {
    const m = re.exec(input)
    if (m && (best === null || m.index < best.index)) best = { index: m.index, length: m[0].length, inner: m[1]!, type }
  }
  if (!best) return input ? [{ type: 'text', value: restoreDollars(input) }] : []
  const before = input.slice(0, best.index)
  const after = input.slice(best.index + best.length)
  return [
    ...(before ? [{ type: 'text' as const, value: restoreDollars(before) }] : []),
    { type: best.type, children: parseEmphasis(best.inner) },
    ...parseEmphasis(after),
  ]
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
    .replace(/\((\w+)\)\/\((\w+)\)/g, '$1/$2')
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
