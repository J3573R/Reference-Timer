import { useRef, useCallback, useEffect } from 'react'
import type { MutableRefObject } from 'react'

export function useHoverPrefetch(
  images: string[],
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
) {
  const loadingRef = useRef<{ path: string; img: HTMLImageElement } | null>(null)
  const loadedRef = useRef<Set<string>>(new Set())

  const cancel = useCallback(() => {
    if (loadingRef.current) {
      loadingRef.current.img.src = ''
      loadingRef.current = null
      window.electronAPI.fs.resumeBackgroundThumbnails()
    }
  }, [])

  const onHover = useCallback((path: string) => {
    if (loadedRef.current.has(path)) return

    cancel()

    // Don't compete with thumbnail loading — only start full-res once thumbnail is cached
    if (!thumbnailCacheRef.current[path]) return

    // Pause background thumbnail generation to free disk I/O for full-res load
    window.electronAPI.fs.pauseBackgroundThumbnails()

    const img = new Image()
    loadingRef.current = { path, img }

    img.onload = () => {
      if (loadingRef.current?.path === path) {
        loadedRef.current.add(path)
        loadingRef.current = null
      }
      window.electronAPI.fs.resumeBackgroundThumbnails()
    }
    img.onerror = () => {
      if (loadingRef.current?.path === path) {
        loadingRef.current = null
      }
      window.electronAPI.fs.resumeBackgroundThumbnails()
    }
    img.src = `file://${path}`
  }, [cancel, thumbnailCacheRef])

  const onLeave = useCallback(() => {
    cancel()
  }, [cancel])

  // Folder switch: reset
  useEffect(() => {
    cancel()
    loadedRef.current.clear()
  }, [images, cancel])

  // Cleanup on unmount
  useEffect(() => {
    return () => { cancel() }
  }, [cancel])

  return { onHover, onLeave }
}
