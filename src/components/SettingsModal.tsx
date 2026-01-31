import { useState, useEffect } from 'react'
import Modal from './Modal'
import type { Settings, ProgressivePreset } from '../types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: Settings
  onUpdateSettings: (settings: Settings) => void
  referenceFolders: string[]
  onAddFolder: () => void
  onRemoveFolder: (path: string) => void
  favorites: string[]
  onCleanupFavorites: () => void
  presets: ProgressivePreset[]
  onDeletePreset: (name: string) => void
  onClearHistory: () => void
}

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  referenceFolders,
  onAddFolder,
  onRemoveFolder,
  favorites,
  onCleanupFavorites,
  presets,
  onDeletePreset,
  onClearHistory,
}: SettingsModalProps) {
  const [missingFavorites, setMissingFavorites] = useState(0)

  useEffect(() => {
    if (isOpen && favorites.length > 0) {
      Promise.all(favorites.map(f => window.electronAPI.fs.fileExists(f)))
        .then(results => {
          setMissingFavorites(results.filter(exists => !exists).length)
        })
    }
  }, [isOpen, favorites])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="form-group">
        <label>Reference Folders</label>
        <div style={{ marginTop: 8 }}>
          {referenceFolders.length === 0 ? (
            <p style={{ color: '#666', fontSize: 13 }}>No folders added</p>
          ) : (
            referenceFolders.map(folder => (
              <div
                key={folder}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#1a1a1a',
                  borderRadius: 4,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                <span style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  {folder}
                </span>
                <button
                  className="btn-icon"
                  onClick={() => onRemoveFolder(folder)}
                  style={{ marginLeft: 8 }}
                >
                  ×
                </button>
              </div>
            ))
          )}
          <button className="btn btn-secondary" onClick={onAddFolder} style={{ marginTop: 8 }}>
            Add Folder
          </button>
        </div>
      </div>

      <div className="form-group">
        <label>Favorites</label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, color: '#888' }}>
            {favorites.length} favorites ({missingFavorites} missing)
          </span>
          {missingFavorites > 0 && (
            <button className="btn btn-secondary" onClick={onCleanupFavorites}>
              Clean Up Missing
            </button>
          )}
        </div>
      </div>

      <div className="form-group">
        <label>Audio</label>
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.audioChime}
              onChange={e => onUpdateSettings({ ...settings, audioChime: e.target.checked })}
            />
            <span style={{ fontSize: 14 }}>Play chime when timer ends</span>
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>Progressive Presets</label>
        <div style={{ marginTop: 8 }}>
          {presets.length === 0 ? (
            <p style={{ color: '#666', fontSize: 13 }}>No custom presets</p>
          ) : (
            presets.map(preset => (
              <div
                key={preset.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: '#1a1a1a',
                  borderRadius: 4,
                  marginBottom: 4,
                }}
              >
                <div>
                  <div style={{ fontSize: 14 }}>{preset.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {preset.stages.map(s => `${s.count}×${s.duration}s`).join(' → ')}
                  </div>
                </div>
                <button className="btn-icon" onClick={() => onDeletePreset(preset.name)}>
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="form-group">
        <label>Data</label>
        <div style={{ marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={onClearHistory}>
            Clear Session History
          </button>
        </div>
      </div>
    </Modal>
  )
}
