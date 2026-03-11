import { useRef, useCallback, useEffect } from 'react'

interface PrefetchOptions {
  ahead: number
  behind: number
}

export function useImagePrefetch(
  currentIndex: number,
  imageList: string[],
  options: PrefetchOptions
) {
  const loadedSet = useRef(new Set<string>())
  const imageRefs = useRef(new Map<string, HTMLImageElement>())
  const loadingSet = useRef(new Set<string>())

  // Build nearest-first ordered list of paths within the window
  const getWindowPaths = useCallback((index: number, list: string[]) => {
    const paths: string[] = []
    const maxAhead = Math.min(options.ahead, list.length - 1 - index)
    const maxBehind = Math.min(options.behind, index)
    const maxDist = Math.max(maxAhead, maxBehind)

    for (let d = 1; d <= maxDist; d++) {
      if (d <= maxAhead) paths.push(list[index + d])
      if (d <= maxBehind) paths.push(list[index - d])
    }
    return paths
  }, [options.ahead, options.behind])

  useEffect(() => {
    const windowPaths = getWindowPaths(currentIndex, imageList)
    const windowSet = new Set(windowPaths)
    // Also include current image in the window set (don't evict it)
    if (imageList[currentIndex]) {
      windowSet.add(imageList[currentIndex])
    }

    // Clean up images outside the window
    for (const [path, img] of imageRefs.current) {
      if (!windowSet.has(path)) {
        img.src = ''
        imageRefs.current.delete(path)
        loadedSet.current.delete(path)
        loadingSet.current.delete(path)
      }
    }

    // Load images in nearest-first order, batched via microtasks
    let cancelled = false
    const loadBatch = async () => {
      for (const path of windowPaths) {
        if (cancelled) break
        if (loadedSet.current.has(path) || loadingSet.current.has(path)) continue
        if (imageRefs.current.has(path)) continue

        loadingSet.current.add(path)
        const img = new Image()
        imageRefs.current.set(path, img)

        img.onload = () => {
          loadedSet.current.add(path)
          loadingSet.current.delete(path)
        }
        img.onerror = () => {
          loadingSet.current.delete(path)
          imageRefs.current.delete(path)
        }
        img.src = `file://${path}`

        // Yield to browser between loads to avoid saturating I/O
        await new Promise(r => setTimeout(r, 0))
      }
    }

    loadBatch()

    return () => {
      cancelled = true
    }
  }, [currentIndex, imageList, getWindowPaths])

  const isLoaded = useCallback((path: string) => {
    return loadedSet.current.has(path)
  }, [])

  return { isLoaded }
}
