import { useMemo, useRef, useEffect, useState, memo } from 'react'

interface ImageGridProps {
  images: string[]
  selectedImages: Set<string>
  favorites: string[]
  onToggleSelect: (path: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFavorite: (path: string) => void
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
}: {
  imagePath: string
  thumbnailPath: string
  isSelected: boolean
  isFavorite: boolean
  onToggleSelect: (path: string) => void
  onToggleFavorite: (path: string) => void
}) {
  return (
    <div
      className={`image-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onToggleSelect(imagePath)}
    >
      <img
        src={`file://${thumbnailPath}`}
        alt=""
        loading="lazy"
        decoding="async"
      />
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
  )
})

export default function ImageGrid({
  images,
  selectedImages,
  favorites,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onToggleFavorite
}: ImageGridProps) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [loadingThumbnails, setLoadingThumbnails] = useState(false)

  // Convert favorites array to Set for O(1) lookup
  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  // Load thumbnails progressively when images change
  useEffect(() => {
    if (images.length === 0) {
      setThumbnails({})
      return
    }

    let cancelled = false
    setLoadingThumbnails(true)

    async function loadThumbnails() {
      for (let i = 0; i < images.length; i += THUMBNAIL_BATCH_SIZE) {
        if (cancelled) break

        const batch = images.slice(i, i + THUMBNAIL_BATCH_SIZE)
        try {
          const batchThumbnails = await window.electronAPI.fs.getThumbnails(batch)
          if (!cancelled) {
            setThumbnails(prev => ({ ...prev, ...batchThumbnails }))
          }
        } catch (error) {
          console.error('Error loading thumbnails:', error)
        }
      }
      if (!cancelled) {
        setLoadingThumbnails(false)
      }
    }

    loadThumbnails()

    return () => {
      cancelled = true
    }
  }, [images])

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
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button className="btn btn-secondary" onClick={onSelectAll}>
          Select All ({images.length})
        </button>
        {selectedImages.size > 0 && (
          <button className="btn btn-secondary" onClick={onClearSelection}>
            Clear Selection
          </button>
        )}
        <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>
          {loadingThumbnails ? 'Loading thumbnails...' : `${images.length} images`}
        </span>
      </div>
      <div className="image-grid">
        {images.map(imagePath => (
          <ImageCard
            key={imagePath}
            imagePath={imagePath}
            thumbnailPath={thumbnails[imagePath] || imagePath}
            isSelected={selectedImages.has(imagePath)}
            isFavorite={favoritesSet.has(imagePath)}
            onToggleSelect={onToggleSelect}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  )
}
