interface TopBarProps {
  selectedCount: number
  onHistory: () => void
  onSettings: () => void
  onStartSession: () => void
  thumbnailProgress?: { current: number; total: number } | null
}

export default function TopBar({ selectedCount, onHistory, onSettings, onStartSession, thumbnailProgress }: TopBarProps) {
  return (
    <div className="top-bar">
      <h1>Reference Timer</h1>
      {thumbnailProgress && thumbnailProgress.total > 0 && (
        <div className="thumbnail-progress">
          Generating thumbnails: {thumbnailProgress.current}/{thumbnailProgress.total}
        </div>
      )}
      <div className="top-bar-actions">
        <button className="btn btn-secondary" onClick={onSettings}>
          Settings
        </button>
        <button className="btn btn-secondary" onClick={onHistory}>
          History
        </button>
        <button
          className="btn btn-primary"
          onClick={onStartSession}
          disabled={selectedCount === 0}
        >
          Start Session {selectedCount > 0 && `(${selectedCount})`}
        </button>
      </div>
    </div>
  )
}
