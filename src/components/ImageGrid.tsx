interface ImageGridProps {
  images: string[]
  selectedImages: Set<string>
  favorites: string[]
  onToggleSelect: (path: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFavorite: (path: string) => void
}

export default function ImageGrid({
  images,
  selectedImages,
  favorites,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onToggleFavorite
}: ImageGridProps) {
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
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onSelectAll}>
          Select All ({images.length})
        </button>
        {selectedImages.size > 0 && (
          <button className="btn btn-secondary" onClick={onClearSelection}>
            Clear Selection
          </button>
        )}
      </div>
      <div className="image-grid">
        {images.map(imagePath => {
          const isSelected = selectedImages.has(imagePath)
          const isFavorite = favorites.includes(imagePath)
          return (
            <div
              key={imagePath}
              className={`image-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggleSelect(imagePath)}
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
          )
        })}
      </div>
    </div>
  )
}
