import Link from 'next/link'

type Section = { heading: string; body: string[] }

/** Terms / Privacy layout: title, date, numbered contents (a real sequence) and sections. */
export function LegalDocument({
  title,
  updated,
  contentsLabel,
  sections,
  questions,
  contactLabel,
}: {
  title: string
  updated: string
  contentsLabel: string
  sections: Section[]
  questions: string
  contactLabel: string
}) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="max-w-3xl">
        <h1 className="text-[30px] font-semibold leading-tight text-foreground sm:text-[36px]">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{updated}</p>
      </header>
      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label={contentsLabel} className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
          <p className="text-sm font-semibold text-foreground">{contentsLabel}</p>
          <ol className="mt-2 grid grid-cols-1 text-sm">
            {sections.map((section, i) => (
              <li key={section.heading}>
                <a href={`#section-${i + 1}`} className="flex min-h-10 items-center gap-2 rounded-md py-1.5 text-muted-foreground hover:text-foreground">
                  <span className="w-5 shrink-0 tabular">{i + 1}.</span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-[72ch]">
          {sections.map((section, i) => (
            <section key={section.heading} id={`section-${i + 1}`} className="scroll-mt-6 border-t border-border py-6 first:border-0 first:pt-0">
              <h2 className="text-[19px] font-semibold text-foreground">
                <span className="mr-2 text-muted-foreground tabular">{i + 1}.</span>
                {section.heading}
              </h2>
              {section.body.map((paragraph) => (
                <p key={paragraph.slice(0, 48)} className="mt-3 text-[15px] leading-relaxed text-foreground/90">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
          <p className="mt-6 border-t border-border pt-6 text-sm text-muted-foreground">
            {questions}{' '}
            <Link href="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
              {contactLabel}
            </Link>
          </p>
        </article>
      </div>
    </div>
  )
}
