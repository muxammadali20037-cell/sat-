'use client'

import { Toaster as SonnerToaster, toast } from 'sonner'

export { toast }

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-lg !border !border-border !bg-popover !text-popover-foreground !shadow-overlay !font-sans',
          description: '!text-muted-foreground',
        },
      }}
    />
  )
}
