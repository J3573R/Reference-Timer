import { useState } from 'react'
import ImagePreview from './ImagePreview'
import type { Session, ViewedImage } from '../types'
import { imageUrl } from '../utils/imageUrl'

interface HistoryViewProps {
  sessions: Session[]
  viewedImages: ViewedImage[]
  onClose: () => void
  onRerun: (session: Session) => void
  onClearHistory: () => void
  onClearViewed: () => void
}

export default function HistoryView({
  sessions,
  viewedImages,
  onClose,
  onRerun,
  onClearHistory,
  onClearViewed,
}: HistoryViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previewList, setPreviewList] = useState<string[] | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }

  const formatMode = (session: Session): string => {
    if (session.mode === 'progressive' && session.preset) {
      return `Progressive (${session.preset})`
    }
    return session.mode.charAt(0).toUpperCase() + session.mode.slice(1)
  }

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  return (
    <div className="history-view">
      <div className="history-header">
        <h2>Session History</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {sessions.length > 0 && (
            <button className="btn btn-secondary" onClick={onClearHistory}>
              Clear History
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="history-content">
        {viewedImages.length > 0 && (
          <div className="viewed-section">
            <div className="viewed-section-header">
              <h3>Recently Viewed</h3>
              <button className="btn btn-secondary btn-small" onClick={onClearViewed}>
                Clear
              </button>
            </div>
            <div className="history-images-grid">
              {[...viewedImages].reverse().map((img, i) => (
                <div key={img.path} className="history-image" onClick={() => {
                  setPreviewList([...viewedImages].reverse().map(v => v.path))
                  setPreviewIndex(i)
                }}>
                  <img src={imageUrl(img.path)} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}

        {sortedSessions.length === 0 ? (
          <div className="history-empty">
            <p>No sessions recorded yet.</p>
            <p>Complete a drawing session to see it here.</p>
          </div>
        ) : (
          <div className="history-list">
            {sortedSessions.map(session => (
              <div key={session.id} className="history-item">
                <div
                  className="history-item-header"
                  onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                >
                  <div className="history-item-info">
                    <h3>{formatMode(session)}</h3>
                    <div className="history-item-meta">
                      <span>{formatDate(session.date)}</span>
                      <span>{session.images.length} images</span>
                      <span>{formatDuration(session.totalTime)}</span>
                    </div>
                  </div>
                  <span className={`history-item-status ${session.complete ? 'complete' : 'incomplete'}`}>
                    {session.complete ? 'Complete' : 'Incomplete'}
                  </span>
                </div>

                {expandedId === session.id && (
                  <div className="history-item-details">
                    <div className="history-images-grid">
                      {session.images.map((img, i) => (
                        <div key={i} className="history-image" onClick={() => {
                          setPreviewList(session.images.map(s => s.path))
                          setPreviewIndex(i)
                        }}>
                          <img src={imageUrl(img.path)} alt="" />
                          <div className="history-image-time">{formatDuration(img.timeSpent)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="history-actions">
                      <button
                        className="btn btn-primary"
                        onClick={() => onRerun(session)}
                      >
                        Re-run Session
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {previewList && (
        <ImagePreview
          imagePath={previewList[previewIndex]}
          imageList={previewList}
          currentIndex={previewIndex}
          onClose={() => setPreviewList(null)}
          onPrev={() => setPreviewIndex(i => i - 1)}
          onNext={() => setPreviewIndex(i => i + 1)}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < previewList.length - 1}
        />
      )}
    </div>
  )
}
