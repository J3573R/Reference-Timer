import { useState, useCallback, useRef, useEffect, type MutableRefObject } from 'react'
import { useImagePrefetch } from '../hooks/useImagePrefetch'

interface ImagePreviewProps {
  imagePath: string
  imageList: string[]
  currentIndex: number
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}

export default function ImagePreview({
  imagePath,
  imageList,
  currentIndex,
  thumbnailCacheRef,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: ImagePreviewProps) {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [fullResLoaded, setFullResLoaded] = useState(false)

  const { isLoaded } = useImagePrefetch(currentIndex, imageList, { ahead: 50, behind: 20 })

  // Reset zoom, position, and load state when image changes
  useEffect(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
    setFullResLoaded(false)
  }, [imagePath])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          if (hasPrev && onPrev) onPrev()
          break
        case 'ArrowRight':
          if (hasNext && onNext) onNext()
          break
        case '+':
        case '=':
          setZoom(z => Math.min(z + 0.25, 5))
          break
        case '-':
          setZoom(z => Math.max(z - 0.25, 0.25))
          break
        case '0':
          setZoom(1)
          setPosition({ x: 0, y: 0 })
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  // Handle wheel zoom with non-passive listener to allow preventDefault
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom(z => Math.min(Math.max(z + delta, 0.25), 5))
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

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 5))
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25))
  const handleResetZoom = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Close if clicking the container background, not the image
    if (e.target === containerRef.current) {
      onClose()
    }
  }, [onClose])

  return (
    <div className="image-preview-overlay" onClick={onClose}>
      <div
        ref={containerRef}
        className="image-preview-container"
        onClick={handleContainerClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <div className="preview-image-wrapper">
          {!fullResLoaded && !isLoaded(imagePath) && thumbnailCacheRef.current[imagePath] && (
            <img
              className="preview-image-thumbnail"
              src={`file://${thumbnailCacheRef.current[imagePath]}`}
              alt=""
              draggable={false}
              onClick={e => e.stopPropagation()}
              style={{
                transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
            />
          )}
          <img
            className="preview-image-full"
            src={`file://${imagePath}`}
            alt=""
            draggable={false}
            onClick={e => e.stopPropagation()}
            onLoad={() => setFullResLoaded(true)}
            style={{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              opacity: fullResLoaded || isLoaded(imagePath) ? 1 : 0,
            }}
          />
        </div>
      </div>

      {/* Close button */}
      <button className="preview-close-btn" onClick={onClose}>
        ✕
      </button>

      {/* Zoom controls */}
      <div className="preview-zoom-controls">
        <button onClick={handleZoomOut} title="Zoom out (-)">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={handleZoomIn} title="Zoom in (+)">+</button>
        <button onClick={handleResetZoom} title="Reset zoom (0)">⟲</button>
      </div>

      {/* Navigation arrows */}
      {hasPrev && (
        <button
          className="preview-nav-btn prev"
          onClick={(e) => {
            e.stopPropagation()
            onPrev?.()
          }}
          title="Previous image (←)"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          className="preview-nav-btn next"
          onClick={(e) => {
            e.stopPropagation()
            onNext?.()
          }}
          title="Next image (→)"
        >
          ›
        </button>
      )}

      {/* Instructions */}
      <div className="preview-instructions">
        Scroll to zoom • Drag to pan • Arrow keys to navigate • Esc to close
      </div>
    </div>
  )
}
