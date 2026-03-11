import { useRef, useCallback, useEffect, useState, type MutableRefObject } from 'react'

const CONCURRENCY = 3
const DEBOUNCE_MS = 150
const MAX_LOADED = 200

export function useGridPrefetch(
  images: string[],
  thumbnailCacheRef: MutableRefObject<Record<string, string>>,
  thumbnailCacheVersion: number,
  enabled: boolean
) {
  // Re-render trigger for isPreloading/isPreloaded status changes
  const [, setTick] = useState(0)
  const tick = useCallback(() => setTick(v => v + 1), [])

  const queueRef = useRef<string[]>([])
  const loadingRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const loadedRef = useRef<Set<string>>(new Set())
  const visibleStartRef = useRef(0)
  const visibleEndRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enabledRef = useRef(enabled)
  const imagesRef = useRef(images)

  // Keep refs in sync
  enabledRef.current = enabled
  imagesRef.current = images

  // Process queue: start loads up to CONCURRENCY limit
  const processQueue = useCallback(() => {
    if (!enabledRef.current) return
    if (imagesRef.current.length === 0) return
    if (loadingRef.current.size >= CONCURRENCY) return
    if (queueRef.current.length === 0) return

    // Thumbnails-first gate: check all visible images have thumbnails
    const visibleImages = imagesRef.current.slice(visibleStartRef.current, visibleEndRef.current)
    const allThumbnailsReady = visibleImages.every(p => thumbnailCacheRef.current[p])
    if (!allThumbnailsReady) return

    while (loadingRef.current.size < CONCURRENCY && queueRef.current.length > 0) {
      const path = queueRef.current.shift()!
      if (loadedRef.current.has(path) || loadingRef.current.has(path)) continue

      const img = new Image()
      loadingRef.current.set(path, img)
      tick()

      img.onload = () => {
        loadingRef.current.delete(path)
        // Evict oldest if at cap
        if (loadedRef.current.size >= MAX_LOADED) {
          const oldest = loadedRef.current.values().next().value
          if (oldest) loadedRef.current.delete(oldest)
        }
        loadedRef.current.add(path)
        tick()
        processQueue()
      }
      img.onerror = () => {
        loadingRef.current.delete(path)
        tick()
        processQueue()
      }
      img.src = `file://${path}`
    }
  }, [thumbnailCacheRef, tick])

  // Handle debounced visible range update
  const applyVisibleRange = useCallback((start: number, end: number) => {
    visibleStartRef.current = start
    visibleEndRef.current = end

    const visiblePaths = imagesRef.current.slice(start, end)

    // Remove queued (not in-flight) images that are no longer visible
    const visibleSet = new Set(visiblePaths)
    queueRef.current = queueRef.current.filter(p => visibleSet.has(p))

    // Add newly visible images that aren't already loaded/loading/queued
    const queueSet = new Set(queueRef.current)
    for (const path of visiblePaths) {
      if (!loadedRef.current.has(path) && !loadingRef.current.has(path) && !queueSet.has(path)) {
        queueRef.current.push(path)
      }
    }

    processQueue()
  }, [processQueue])

  // Public: called from onCellsRendered, debounced internally
  const onVisibleRangeChange = useCallback((startIndex: number, endIndex: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      applyVisibleRange(startIndex, endIndex)
    }, DEBOUNCE_MS)
  }, [applyVisibleRange])

  // Public: bump a path to front of queue (hover priority)
  const prioritize = useCallback((path: string) => {
    if (loadedRef.current.has(path) || loadingRef.current.has(path)) return
    // Remove from current position if present
    queueRef.current = queueRef.current.filter(p => p !== path)
    // Add at front
    queueRef.current.unshift(path)
    processQueue()
  }, [processQueue])

  // Public: check loading/loaded state
  const isPreloading = useCallback((path: string) => {
    return loadingRef.current.has(path)
  }, [])

  const isPreloaded = useCallback((path: string) => {
    return loadedRef.current.has(path)
  }, [])

  // Re-evaluate queue when thumbnailCacheVersion changes (gate may open)
  useEffect(() => {
    processQueue()
  }, [thumbnailCacheVersion, processQueue])

  // Re-evaluate when enabled changes (resume after preview closes)
  useEffect(() => {
    if (enabled) processQueue()
  }, [enabled, processQueue])

  // Folder switch: reset everything when images array changes
  useEffect(() => {
    // Cancel pending debounce to prevent stale range from queuing wrong images
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // Abort all in-flight loads
    for (const [, img] of loadingRef.current) {
      img.src = ''
    }
    loadingRef.current.clear()
    queueRef.current = []
    loadedRef.current.clear()
    tick()
  }, [images, tick])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, img] of loadingRef.current) {
        img.src = ''
      }
      loadingRef.current.clear()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return { onVisibleRangeChange, prioritize, isPreloading, isPreloaded }
}
