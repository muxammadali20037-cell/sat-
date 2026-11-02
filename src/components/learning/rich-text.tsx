import * as React from 'react'
import katex from 'katex'
import { cn } from '@/lib/utils'
import { parseRichText, type BlockNode, type InlineNode } from '@/lib/rich-text/tokenize'

/**
 * Safe renderer for authored content (stems, passages, explanations, lesson notes, AI output).
 * Never interprets HTML. Math is rendered by KaTeX with trust disabled, whose output escapes text.
 * Works in Server and Client Components (no hooks).
 */

function renderMath(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
    output: 'htmlAndMathml',
    maxSize: 20,
    maxExpand: 500,
  })
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'text':
            return <React.Fragment key={i}>{node.value}</React.Fragment>
          case 'break':
            return <br key={i} />
          case 'math':
            return <span key={i} className="katex-inline" dangerouslySetInnerHTML={{ __html: renderMath(node.value, false) }} />
          case 'bold':
            return (
              <strong key={i} className="font-semibold">
                <Inline nodes={node.children} />
              </strong>
            )
          case 'italic':
            return (
              <em key={i}>
                <Inline nodes={node.children} />
              </em>
            )
          case 'underline':
            return (
              <u key={i} className="decoration-2 underline-offset-[3px]">
                <Inline nodes={node.children} />
              </u>
            )
        }
      })}
    </>
  )
}

function Block({ node }: { node: BlockNode }) {
  if (node.type === 'display_math') {
    return <div className="my-2" dangerouslySetInnerHTML={{ __html: renderMath(node.value, true) }} />
  }
  if (node.type === 'table') {
    // Numbers (right/center-aligned columns) stay on one line; the label column gets room to read.
    const alignClass = (i: number) =>
      node.align[i] === 'right' ? 'text-right whitespace-nowrap' : node.align[i] === 'center' ? 'text-center whitespace-nowrap' : i === 0 ? 'text-left min-w-[8.5rem]' : 'text-left'
    return (
      // relative + overflow: wide tables scroll inside the passage instead of widening the page.
      <div className="relative my-3 max-w-full overflow-x-auto">
        <table className="w-full border-collapse bg-card text-[0.95em] tabular-nums">
          <thead>
            <tr>
              {node.header.map((cell, i) => (
                <th key={i} scope="col" className={cn('border border-border-strong bg-muted px-3 py-1.5 align-bottom font-semibold', alignClass(i), 'whitespace-normal')}>
                  <Inline nodes={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) => (
                  <td key={i} className={cn('border border-border-strong px-3 py-1.5 align-top', alignClass(i))}>
                    <Inline nodes={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (node.type === 'list') {
    return (
      <ul className="my-2 list-disc space-y-1 pl-5">
        {node.items.map((item, i) => (
          <li key={i}>
            <Inline nodes={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <p className="[&:not(:first-child)]:mt-3">
      <Inline nodes={node.children} />
    </p>
  )
}

export function RichText({ source, className, as: Tag = 'div' }: { source: string | null | undefined; className?: string; as?: 'div' | 'span' }) {
  if (!source) return null
  const blocks = parseRichText(source)
  if (Tag === 'span' && blocks.length === 1 && blocks[0]!.type === 'paragraph') {
    return (
      <span className={className}>
        <Inline nodes={blocks[0]!.children} />
      </span>
    )
  }
  return (
    <div className={cn('break-words', className)}>
      {blocks.map((b, i) => (
        <Block key={i} node={b} />
      ))}
    </div>
  )
}
