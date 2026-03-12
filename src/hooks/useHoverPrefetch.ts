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
    }
  }, [])

  const onHover = useCallback((path: string) => {
    if (loadedRef.current.has(path)) return

    cancel()

    // Don't compete with thumbnail loading — only start full-res once thumbnail is cached
    if (!thumbnailCacheRef.current[path]) return

    const img = new Image()
    loadingRef.current = { path, img }

    img.onload = () => {
      if (loadingRef.current?.path === path) {
        loadedRef.current.add(path)
        loadingRef.current = null
      }
    }
    img.onerror = () => {
      if (loadingRef.current?.path === path) {
        loadingRef.current = null
      }
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
