interface TopBarProps {
  selectedCount: number
  onManageFolders: () => void
  onHistory: () => void
  onStartSession: () => void
}

export default function TopBar({ selectedCount, onManageFolders, onHistory, onStartSession }: TopBarProps) {
  return (
    <div className="top-bar">
      <h1>Reference Timer</h1>
      <div className="top-bar-actions">
        <button className="btn btn-secondary" onClick={onManageFolders}>
          Manage Folders
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
