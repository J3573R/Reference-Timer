import { useState, useCallback, useRef, useEffect } from 'react'

/**
 * Disk-related actions for the currently displayed image:
 * reveal in Finder and copy the image bitmap to the clipboard.
 * `copied` flashes true briefly after a successful copy for UI feedback.
 */
export function useImageActions(imagePath: string) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const revealInFinder = useCallback(() => {
    window.electronAPI.fs.showInFinder(imagePath)
  }, [imagePath])

  const copyImage = useCallback(async () => {
    const ok = await window.electronAPI.fs.copyImageToClipboard(imagePath)
    if (ok) {
      setCopied(true)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), 1200)
    }
  }, [imagePath])

  return { copied, copyImage, revealInFinder }
}
