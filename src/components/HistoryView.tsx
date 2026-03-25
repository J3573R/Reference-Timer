import { useState } from 'react'
import ImagePreview from './ImagePreview'
import type { Session } from '../types'

interface HistoryViewProps {
  sessions: Session[]
  onClose: () => void
  onRerun: (session: Session) => void
  onClearHistory: () => void
}

export default function HistoryView({ sessions, onClose, onRerun, onClearHistory }: HistoryViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previewSession, setPreviewSession] = useState<Session | null>(null)
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
                          setPreviewSession(session)
                          setPreviewIndex(i)
                        }}>
                          <img src={`file://${img.path}`} alt="" />
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
      {previewSession && (
        <ImagePreview
          imagePath={previewSession.images[previewIndex].path}
          imageList={previewSession.images.map(img => img.path)}
          currentIndex={previewIndex}
          onClose={() => setPreviewSession(null)}
          onPrev={() => setPreviewIndex(i => i - 1)}
          onNext={() => setPreviewIndex(i => i + 1)}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < previewSession.images.length - 1}
        />
      )}
    </div>
  )
}
