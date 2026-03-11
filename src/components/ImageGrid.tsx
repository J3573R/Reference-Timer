import { useMemo, useEffect, useState, useCallback, useRef, type MutableRefObject } from 'react'
import { Grid } from 'react-window'
import ImagePreview from './ImagePreview'

interface ImageGridProps {
  images: string[]
  selectedImages: Set<string>
  favorites: string[]
  onToggleSelect: (path: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFavorite: (path: string) => void
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
  thumbnailCacheVersion: number
  onThumbnailsLoaded: (thumbnails: Record<string, string>) => void
}

const CARD_SIZE = 176 // 160px card + 16px gap
const GAP = 16

interface CellProps {
  images: string[]
  columnCount: number
  selectedImages: Set<string>
  favoritesSet: Set<string>
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
  thumbnailCacheVersion: number
  onToggleSelect: (path: string) => void
  onToggleFavorite: (path: string) => void
  onPreview: (path: string) => void
}

function ImageCell({
  ariaAttributes,
  columnIndex,
  rowIndex,
  style,
  images,
  columnCount,
  selectedImages,
  favoritesSet,
  thumbnailCacheRef,
  thumbnailCacheVersion,
  onToggleSelect,
  onToggleFavorite,
  onPreview,
}: { columnIndex: number; rowIndex: number; style: React.CSSProperties; ariaAttributes: Record<string, unknown> } & CellProps) {
  const index = rowIndex * columnCount + columnIndex
  if (index >= images.length) {
    return <div style={style} {...ariaAttributes} />
  }

  const imagePath = images[index]
  const thumbnailPath = thumbnailCacheRef.current[imagePath]
  const isSelected = selectedImages.has(imagePath)
  const isFavorite = favoritesSet.has(imagePath)

  // thumbnailCacheVersion is a passive dependency in cellProps — it triggers
  // cell re-renders when new thumbnails arrive, but the actual data is read from the ref.
  void thumbnailCacheVersion

  return (
    <div style={{ ...style, padding: GAP / 2 }} {...ariaAttributes}>
      <div
        className={`image-card ${isSelected ? 'selected' : ''}`}
        onClick={() => onPreview(imagePath)}
      >
        {thumbnailPath ? (
          <img
            src={`file://${thumbnailPath}`}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="image-card-placeholder" />
        )}
        <div
          className={`image-card-checkbox ${isSelected ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(imagePath)
          }}
          title={isSelected ? 'Deselect' : 'Select for session'}
        >
          {isSelected ? '\u2713' : ''}
        </div>
        <div className="image-card-overlay">
          <button
            className={`favorite-btn ${isFavorite ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(imagePath)
            }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1.5l2 4 4.5.5-3.25 3 .75 4.5L8 11.5l-4 2 .75-4.5L1.5 6l4.5-.5 2-4z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill={isFavorite ? 'currentColor' : 'none'}
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ImageGrid({
  images,
  selectedImages,
  favorites,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onToggleFavorite,
  thumbnailCacheRef,
  thumbnailCacheVersion,
  onThumbnailsLoaded,
}: ImageGridProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [columnCount, setColumnCount] = useState(6)
  const visibleRangeRef = useRef<{ rowStart: number; rowStop: number; colStart: number; colStop: number } | null>(null)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingRef = useRef(false)

  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  const rowCount = Math.ceil(images.length / columnCount)

  // Derive column count from container resize
  const handleResize = useCallback((size: { width: number }) => {
    const cols = Math.max(1, Math.floor((size.width + GAP) / CARD_SIZE))
    setColumnCount(cols)
  }, [])

  // Visibility-aware thumbnail loading
  const loadVisibleThumbnails = useCallback(() => {
    const range = visibleRangeRef.current
    if (!range || loadingRef.current) return

    // Compute visible image indices
    const startIdx = range.rowStart * columnCount + range.colStart
    const endIdx = Math.min(range.rowStop * columnCount + range.colStop + 1, images.length)

    // Extend by 2 rows overscan for preloading
    const overscanStart = Math.max(0, startIdx - columnCount * 2)
    const overscanEnd = Math.min(images.length, endIdx + columnCount * 2)

    const uncached: string[] = []
    for (let i = overscanStart; i < overscanEnd; i++) {
      const img = images[i]
      if (img && !thumbnailCacheRef.current[img]) {
        uncached.push(img)
      }
    }

    if (uncached.length === 0) return

    loadingRef.current = true
    window.electronAPI.fs.getThumbnails(uncached, 'high')
      .then((results) => {
        onThumbnailsLoaded(results)
      })
      .catch(console.error)
      .finally(() => {
        loadingRef.current = false
        // Re-check: if user scrolled during loading, new visible images may need loading
        loadVisibleThumbnails()
      })
  }, [images, columnCount, onThumbnailsLoaded])

  const handleCellsRendered = useCallback((
    visibleCells: { columnStartIndex: number; columnStopIndex: number; rowStartIndex: number; rowStopIndex: number }
  ) => {
    visibleRangeRef.current = {
      rowStart: visibleCells.rowStartIndex,
      rowStop: visibleCells.rowStopIndex,
      colStart: visibleCells.columnStartIndex,
      colStop: visibleCells.columnStopIndex,
    }

    // Debounce: load thumbnails 100ms after scroll stops
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    loadTimerRef.current = setTimeout(loadVisibleThumbnails, 100)
  }, [loadVisibleThumbnails])

  // Load visible thumbnails when images change (folder switch)
  useEffect(() => {
    // Small delay to let Grid render and fire onCellsRendered first
    const timer = setTimeout(loadVisibleThumbnails, 150)
    return () => clearTimeout(timer)
  }, [images, loadVisibleThumbnails])

  // Preview navigation
  const currentPreviewIndex = previewImage ? images.indexOf(previewImage) : -1
  const hasPrev = currentPreviewIndex > 0
  const hasNext = currentPreviewIndex < images.length - 1

  const handlePreview = useCallback((path: string) => {
    setPreviewImage(path)
  }, [])

  const handlePrevImage = useCallback(() => {
    if (currentPreviewIndex > 0) {
      setPreviewImage(images[currentPreviewIndex - 1])
    }
  }, [currentPreviewIndex, images])

  const handleNextImage = useCallback(() => {
    if (currentPreviewIndex < images.length - 1) {
      setPreviewImage(images[currentPreviewIndex + 1])
    }
  }, [currentPreviewIndex, images])

  const handleClosePreview = useCallback(() => {
    setPreviewImage(null)
  }, [])

  // Memoize cellProps to avoid unnecessary Grid re-renders
  const cellProps: CellProps = useMemo(() => ({
    images,
    columnCount,
    selectedImages,
    favoritesSet,
    thumbnailCacheRef,
    thumbnailCacheVersion,
    onToggleSelect,
    onToggleFavorite,
    onPreview: handlePreview,
  // thumbnailCacheRef is a stable ref — excluded from deps intentionally
  }), [images, columnCount, selectedImages, favoritesSet, thumbnailCacheVersion, onToggleSelect, onToggleFavorite, handlePreview])

  if (images.length === 0) {
    return (
      <div className="image-grid-container">
        <div className="empty-state">
          <p>No images in this folder</p>
        </div>
      </div>
    )
  }

  return (
    <div className="image-grid-container">
      <div className="grid-header">
        <button className="btn btn-secondary" onClick={onSelectAll}>
          Select All ({images.length})
        </button>
        {selectedImages.size > 0 && (
          <button className="btn btn-secondary" onClick={onClearSelection}>
            Clear Selection
          </button>
        )}
        <span className="grid-info">
          {images.length} images
        </span>
      </div>
      <div className="image-grid">
        <Grid
          cellComponent={ImageCell}
          cellProps={cellProps}
          columnCount={columnCount}
          columnWidth={CARD_SIZE}
          rowCount={rowCount}
          rowHeight={CARD_SIZE}
          overscanCount={3}
          onCellsRendered={handleCellsRendered}
          onResize={handleResize}
        />
      </div>

      {previewImage && (
        <ImagePreview
          imagePath={previewImage}
          onClose={handleClosePreview}
          onPrev={handlePrevImage}
          onNext={handleNextImage}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </div>
  )
}
