import { useMemo, useEffect, useState, memo, useCallback } from 'react'
import ImagePreview from './ImagePreview'

interface ImageGridProps {
  images: string[]
  selectedImages: Set<string>
  favorites: string[]
  onToggleSelect: (path: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFavorite: (path: string) => void
  thumbnailCache: Record<string, string>
  onThumbnailsLoaded: (thumbnails: Record<string, string>) => void
}

const THUMBNAIL_BATCH_SIZE = 20

// Memoized image card component
const ImageCard = memo(function ImageCard({
  imagePath,
  thumbnailPath,
  isSelected,
  isFavorite,
  onToggleSelect,
  onToggleFavorite,
  onPreview,
}: {
  imagePath: string
  thumbnailPath: string
  isSelected: boolean
  isFavorite: boolean
  onToggleSelect: (path: string) => void
  onToggleFavorite: (path: string) => void
  onPreview: (path: string) => void
}) {
  return (
    <div
      className={`image-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onPreview(imagePath)}
    >
      <img
        src={`file://${thumbnailPath}`}
        alt=""
        loading="lazy"
        decoding="async"
      />
      {/* Selection checkbox */}
      <div
        className={`image-card-checkbox ${isSelected ? 'checked' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(imagePath)
        }}
        title={isSelected ? 'Deselect' : 'Select for session'}
      >
        {isSelected ? '✓' : ''}
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
  )
})

export default function ImageGrid({
  images,
  selectedImages,
  favorites,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onToggleFavorite,
  thumbnailCache,
  onThumbnailsLoaded
}: ImageGridProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  // Convert favorites array to Set for O(1) lookup
  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  // Calculate thumbnail loading progress
  const cachedCount = useMemo(() => {
    return images.filter(img => thumbnailCache[img]).length
  }, [images, thumbnailCache])
  const totalCount = images.length
  const isLoadingThumbnails = cachedCount < totalCount

  // Load thumbnails progressively when images change, using cache
  useEffect(() => {
    if (images.length === 0) {
      return
    }

    // Filter to only images not in cache
    const uncachedImages = images.filter(img => !thumbnailCache[img])

    if (uncachedImages.length === 0) {
      // All images already in cache
      return
    }

    let cancelled = false

    async function loadThumbnails() {
      for (let i = 0; i < uncachedImages.length; i += THUMBNAIL_BATCH_SIZE) {
        if (cancelled) break

        const batch = uncachedImages.slice(i, i + THUMBNAIL_BATCH_SIZE)
        try {
          const batchThumbnails = await window.electronAPI.fs.getThumbnails(batch)
          if (!cancelled) {
            onThumbnailsLoaded(batchThumbnails)
          }
        } catch (error) {
          console.error('Error loading thumbnails:', error)
        }
      }
    }

    loadThumbnails()

    return () => {
      cancelled = true
    }
  }, [images, thumbnailCache, onThumbnailsLoaded])

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
          {isLoadingThumbnails
            ? `Loading thumbnails: ${cachedCount}/${totalCount}`
            : `${images.length} images`}
        </span>
      </div>
      <div className="image-grid">
        {images.map(imagePath => (
          <ImageCard
            key={imagePath}
            imagePath={imagePath}
            thumbnailPath={thumbnailCache[imagePath] || imagePath}
            isSelected={selectedImages.has(imagePath)}
            isFavorite={favoritesSet.has(imagePath)}
            onToggleSelect={onToggleSelect}
            onToggleFavorite={onToggleFavorite}
            onPreview={handlePreview}
          />
        ))}
      </div>

      {/* Image Preview Modal */}
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
