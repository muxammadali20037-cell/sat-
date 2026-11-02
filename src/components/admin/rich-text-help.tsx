/** Compact syntax reference for the safe rich-text format (shared by lesson and question editors). */
export function RichTextHelp({ className }: { className?: string }) {
  const rows: Array<[string, string]> = [
    ['$x^2 + 1$', 'inline math (KaTeX)'],
    ['$$\\frac{a}{b}$$', 'display math on its own line'],
    ['**bold**', 'bold'],
    ['*italic*', 'italic'],
    ['__underline__', 'underline (e.g. the tested word)'],
    ['- item', 'bullet list (each line starts with "- ")'],
    ['| A | B |\n| --- | ---: |\n| 1 | 2 |', 'table: header, separator, rows (---: aligns right)'],
    ['blank line', 'new paragraph'],
    ['\\$5', 'a literal dollar sign'],
  ]
  return (
    <details className={className}>
      <summary className="cursor-pointer select-none text-[13px] text-muted-foreground hover:text-foreground">Formatting help</summary>
      <table className="mt-2 w-full text-[13px]">
        <caption className="sr-only">Rich text syntax</caption>
        <tbody>
          {rows.map(([code, meaning]) => (
            <tr key={code} className="border-t border-border">
              <td className="py-1 pr-3">
                <code className="whitespace-pre rounded bg-muted px-1 py-0.5">{code}</code>
              </td>
              <td className="py-1 text-muted-foreground">{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[13px] text-muted-foreground">HTML is never rendered; it is shown as plain text.</p>
    </details>
  )
}
