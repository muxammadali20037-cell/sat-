'use client'

import * as React from 'react'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { checkUploadFile, type UploadPurpose } from '@/features/content/constants'
import { createUploadTarget, finalizeUpload } from '@/features/content/upload-actions'

export type UploadResult = { ok: true; path: string; previewUrl: string | null } | { ok: false; error: string }

/**
 * Upload flow: server action mints a signed upload token (service role, after authorization) →
 * the browser PUTs the file straight to private storage → server action verifies the object.
 */
export function useSignedUpload() {
  const [uploading, setUploading] = React.useState(false)
  const upload = React.useCallback(async (purpose: UploadPurpose, file: File, lessonId?: string): Promise<UploadResult> => {
    const problem = checkUploadFile(purpose, file)
    if (problem) return { ok: false, error: problem }
    setUploading(true)
    try {
      const target = await createUploadTarget({ purpose, contentType: file.type, size: file.size, lessonId })
      if (!target.ok) return { ok: false, error: target.error }
      const { bucket, path, token } = target.data!
      let supabase
      try {
        supabase = createBrowserSupabase()
      } catch {
        return { ok: false, error: 'Storage is not configured for this deployment.' }
      }
      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type, upsert: false })
      if (error) return { ok: false, error: `Upload failed: ${error.message}` }
      const done = await finalizeUpload({ purpose, path })
      if (!done.ok) return { ok: false, error: done.error }
      return { ok: true, path: done.data!.path, previewUrl: done.data!.previewUrl }
    } catch {
      return { ok: false, error: 'Upload failed. Check your connection and try again.' }
    } finally {
      setUploading(false)
    }
  }, [])
  return { upload, uploading }
}
