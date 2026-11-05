'use client'

import { useState } from 'react'
import { Check, Copy, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function InviteLink({ url, shareUrl, labels }: { url: string; shareUrl: string; labels: { yourLink: string; copy: string; copied: string; shareTelegram: string } }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the field stays selectable for a manual copy.
    }
  }
  return (
    <div className="space-y-3">
      <label htmlFor="invite-url" className="text-sm font-medium">
        {labels.yourLink}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-sm" data-testid="invite-url" />
        <Button type="button" variant="secondary" onClick={copy} className="shrink-0">
          {copied ? <Check /> : <Copy />} {copied ? labels.copied : labels.copy}
        </Button>
      </div>
      <Button asChild>
        <a href={shareUrl} target="_blank" rel="noopener noreferrer" data-testid="invite-telegram">
          <Send /> {labels.shareTelegram}
        </a>
      </Button>
      <p className="sr-only" aria-live="polite">{copied ? labels.copied : ''}</p>
    </div>
  )
}
