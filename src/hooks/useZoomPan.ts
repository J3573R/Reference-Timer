import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5

/**
 * Shared zoom/pan behavior for image viewers.
 * Attach `containerRef` and the mouse handlers to the scroll/drag surface,
 * and apply `imageStyle` to the element that should scale.
 * Zoom and position reset whenever `resetKey` changes.
 */
export function useZoomPan(resetKey: string) {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset zoom and position when image changes
  useEffect(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }, [resetKey])

  // Handle wheel zoom with non-passive listener to allow preventDefault
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom(z => Math.min(Math.max(z + delta, MIN_ZOOM), MAX_ZOOM))
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }, [zoom, position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, MAX_ZOOM)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, MIN_ZOOM)), [])
  const resetZoom = useCallback(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  const imageStyle: CSSProperties = {
    transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
  }

  return {
    zoom,
    isDragging,
    containerRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    zoomIn,
    zoomOut,
    resetZoom,
    imageStyle,
  }
}
