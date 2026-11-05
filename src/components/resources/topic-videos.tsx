import { ExternalLink, PlayCircle } from 'lucide-react'
import type { TopicVideo } from '@/features/resources/server'

/** "Videos on this topic": published YouTube links for the skill, credited to their channel. */
export function TopicVideos({ videos, title, note }: { videos: TopicVideo[]; title: string; note: string }) {
  if (videos.length === 0) return null
  return (
    <section aria-labelledby="topic-videos" className="rounded-lg border border-border bg-card p-5" data-testid="topic-videos">
      <h2 id="topic-videos" className="text-[17px] font-semibold text-foreground">
        {title}
      </h2>
      <ul className="mt-3 space-y-3">
        {videos.map((v) => (
          <li key={v.id}>
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="group inline-flex items-start gap-2 text-sm font-medium text-primary hover:underline">
              <PlayCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {v.title}
                <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />
              </span>
            </a>
            <p className="ml-6 text-xs text-muted-foreground">
              {v.attribution || v.providerName}
              {v.language !== 'en' ? '' : ' · English'}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{note}</p>
    </section>
  )
}
