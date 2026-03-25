interface TopBarProps {
  selectedCount: number
  onHistory: () => void
  onSettings: () => void
  onStartSession: () => void
  onRefreshFolders: () => void
  hasFolders: boolean
  thumbnailProgress?: { current: number; total: number } | null
}

export default function TopBar({ selectedCount, onHistory, onSettings, onStartSession, onRefreshFolders, hasFolders, thumbnailProgress }: TopBarProps) {
  return (
    <div className="top-bar">
      <h1>Reference Timer</h1>
      {thumbnailProgress && thumbnailProgress.total > 0 && (
        <div className="thumbnail-progress">
          Generating thumbnails: {thumbnailProgress.current}/{thumbnailProgress.total}
        </div>
      )}
      <div className="top-bar-actions">
        <button
          className="btn btn-icon"
          onClick={onRefreshFolders}
          disabled={!hasFolders}
          title="Refresh folders"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1v4h4" />
            <path d="M15 15v-4h-4" />
            <path d="M13.5 6A6 6 0 0 0 3.8 3.8L1 5M15 11l-2.8 1.2A6 6 0 0 1 2.5 10" />
          </svg>
        </button>
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
