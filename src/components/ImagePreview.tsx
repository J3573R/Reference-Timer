import { useCallback, useEffect } from 'react'
import { useImagePrefetch } from '../hooks/useImagePrefetch'
import { useZoomPan } from '../hooks/useZoomPan'
import { useImageActions } from '../hooks/useImageActions'
import { imageUrl } from '../utils/imageUrl'

interface ImagePreviewProps {
  imagePath: string
  imageList: string[]
  currentIndex: number
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
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: ImagePreviewProps) {
  const {
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
  } = useZoomPan(imagePath)
  const { copied, copyImage, revealInFinder } = useImageActions(imagePath)
  useImagePrefetch(currentIndex, imageList)

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return
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
          zoomIn()
          break
        case '-':
          zoomOut()
          break
        case '0':
          resetZoom()
          break
        case 'c':
          copyImage()
          break
        case 'f':
          revealInFinder()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onPrev, onNext, hasPrev, hasNext, zoomIn, zoomOut, resetZoom, copyImage, revealInFinder])

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Close if clicking the container background, not the image
    if (e.target === containerRef.current) {
      onClose()
    }
  }, [onClose, containerRef])

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
          <img
            className="preview-image-full"
            src={imageUrl(imagePath)}
            alt=""
            draggable={false}
            onClick={e => e.stopPropagation()}
            style={imageStyle}
          />
        </div>
      </div>

      {/* Close button */}
      <button className="preview-close-btn" onClick={onClose}>
        ✕
      </button>

      {/* Zoom + file controls — stop propagation so clicks don't hit the overlay's close handler */}
      <div className="preview-zoom-controls" onClick={e => e.stopPropagation()}>
        <button onClick={zoomOut} title="Zoom out (-)">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} title="Zoom in (+)">+</button>
        <button onClick={resetZoom} title="Reset zoom (0)">⟲</button>
        <span className="preview-controls-divider" />
        <button onClick={copyImage} title="Copy image to clipboard (C)">
          {copied ? '✓' : '⧉'}
        </button>
        <button onClick={revealInFinder} title="Reveal in Finder (F)">⌖</button>
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
        Scroll to zoom • Drag to pan • C copy • F reveal in Finder • Esc to close
      </div>
    </div>
  )
}
