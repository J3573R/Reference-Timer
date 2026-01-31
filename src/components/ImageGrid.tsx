import { useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { Grid } from 'react-window'

interface ImageGridProps {
  images: string[]
  selectedImages: Set<string>
  favorites: string[]
  onToggleSelect: (path: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFavorite: (path: string) => void
}

const CARD_SIZE = 160 // Image card size in pixels
const GAP = 12 // Gap between cards

export default function ImageGrid({
  images,
  selectedImages,
  favorites,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onToggleFavorite
}: ImageGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Convert favorites array to Set for O(1) lookup
  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  // Measure container size
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight - 52, // Subtract header height
      })
    }

    updateSize()

    const observer = new ResizeObserver(updateSize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  // Calculate grid dimensions
  const columnCount = Math.max(1, Math.floor((containerSize.width + GAP) / (CARD_SIZE + GAP)))
  const rowCount = Math.ceil(images.length / columnCount)

  // Cell renderer
  const Cell = useCallback(({ columnIndex, rowIndex, style }: {
    columnIndex: number
    rowIndex: number
    style: React.CSSProperties
  }) => {
    const index = rowIndex * columnCount + columnIndex
    if (index >= images.length) return null

    const imagePath = images[index]
    const isSelected = selectedImages.has(imagePath)
    const isFavorite = favoritesSet.has(imagePath)

    return (
      <div
        style={{
          ...style,
          left: Number(style.left) + GAP,
          top: Number(style.top) + GAP,
          width: CARD_SIZE,
          height: CARD_SIZE,
        }}
      >
        <div
          className={`image-card ${isSelected ? 'selected' : ''}`}
          onClick={() => onToggleSelect(imagePath)}
          style={{ width: '100%', height: '100%' }}
        >
          <img src={`file://${imagePath}`} alt="" loading="lazy" />
          <div className="image-card-overlay">
            <button
              className={`favorite-btn ${isFavorite ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleFavorite(imagePath)
              }}
            >
              {isFavorite ? '⭐' : '☆'}
            </button>
          </div>
        </div>
      </div>
    )
  }, [images, selectedImages, favoritesSet, columnCount, onToggleSelect, onToggleFavorite])

  if (images.length === 0) {
    return (
      <div className="image-grid-container" ref={containerRef}>
        <div className="empty-state">
          <p>No images in this folder</p>
        </div>
      </div>
    )
  }

  return (
    <div className="image-grid-container" ref={containerRef}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={onSelectAll}>
          Select All ({images.length})
        </button>
        {selectedImages.size > 0 && (
          <button className="btn btn-secondary" onClick={onClearSelection}>
            Clear Selection
          </button>
        )}
        {images.length > 100 && (
          <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>
            Showing {images.length} images (virtualized)
          </span>
        )}
      </div>
      {containerSize.width > 0 && containerSize.height > 0 && (
        <Grid
          columnCount={columnCount}
          columnWidth={CARD_SIZE + GAP}
          height={containerSize.height}
          rowCount={rowCount}
          rowHeight={CARD_SIZE + GAP}
          width={containerSize.width}
          style={{ outline: 'none' }}
        >
          {Cell}
        </Grid>
      )}
    </div>
  )
}
