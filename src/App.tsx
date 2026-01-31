import { useEffect, useState, useCallback } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import ImageGrid from './components/ImageGrid'
import SessionModal, { type SessionConfig } from './components/SessionModal'
import SessionView from './components/SessionView'
import HistoryView from './components/HistoryView'
import type { FolderNode } from './electron'
import type { ProgressivePreset, Session, Settings } from './types'

export default function App() {
  const [referenceFolders, setReferenceFolders] = useState<string[]>([])
  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [currentImages, setCurrentImages] = useState<string[]>([])
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [presets, setPresets] = useState<ProgressivePreset[]>([])
  const [settings, setSettings] = useState<Settings>({ audioChime: true })
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [activeSession, setActiveSession] = useState<{
    config: SessionConfig
    images: string[]
  } | null>(null)
  const [sessionHistory, setSessionHistory] = useState<Session[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Load initial data
  useEffect(() => {
    Promise.all([
      window.electronAPI.store.get('referenceFolders'),
      window.electronAPI.store.get('favorites'),
      window.electronAPI.store.get('progressivePresets'),
      window.electronAPI.store.get('settings'),
      window.electronAPI.store.get('sessionHistory'),
    ]).then(([folders, favs, prsts, sttngs, history]) => {
      setReferenceFolders(folders)
      setFavorites(favs)
      setPresets(prsts)
      setSettings(sttngs)
      setSessionHistory(history)
    })
  }, [])

  // Scan folders when referenceFolders changes
  useEffect(() => {
    if (referenceFolders.length === 0) {
      setFolderTrees([])
      return
    }
    Promise.all(
      referenceFolders.map(f => window.electronAPI.fs.scanFolder(f))
    ).then(setFolderTrees)
  }, [referenceFolders])

  // Load images when selected path changes
  useEffect(() => {
    if (!selectedPath) {
      setCurrentImages([])
      return
    }
    if (selectedPath === '__favorites__') {
      setCurrentImages(favorites)
    } else {
      window.electronAPI.fs.getImagesInFolder(selectedPath).then(setCurrentImages)
    }
    setSelectedImages(new Set())
  }, [selectedPath, favorites])

  const handleManageFolders = useCallback(async () => {
    const folder = await window.electronAPI.fs.selectFolder()
    if (folder && !referenceFolders.includes(folder)) {
      const newFolders = [...referenceFolders, folder]
      await window.electronAPI.store.set('referenceFolders', newFolders)
      setReferenceFolders(newFolders)
    }
  }, [referenceFolders])

  const handleToggleSelect = useCallback((path: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedImages(new Set(currentImages))
  }, [currentImages])

  const handleClearSelection = useCallback(() => {
    setSelectedImages(new Set())
  }, [])

  const handleToggleFavorite = useCallback(async (path: string) => {
    const newFavorites = favorites.includes(path)
      ? favorites.filter(f => f !== path)
      : [...favorites, path]
    await window.electronAPI.store.set('favorites', newFavorites)
    setFavorites(newFavorites)
  }, [favorites])

  const handleSavePreset = useCallback(async (preset: ProgressivePreset) => {
    const newPresets = [...presets, preset]
    await window.electronAPI.store.set('progressivePresets', newPresets)
    setPresets(newPresets)
  }, [presets])

  const handleStartSession = useCallback((config: SessionConfig) => {
    setShowSessionModal(false)
    setActiveSession({
      config,
      images: Array.from(selectedImages),
    })
  }, [selectedImages])

  const handleEndSession = useCallback(async (session: Session) => {
    const newHistory = [...sessionHistory, session]
    await window.electronAPI.store.set('sessionHistory', newHistory)
    setSessionHistory(newHistory)
    setActiveSession(null)
  }, [sessionHistory])

  const handleClearHistory = useCallback(async () => {
    await window.electronAPI.store.set('sessionHistory', [])
    setSessionHistory([])
  }, [])

  const handleRerunSession = useCallback((session: Session) => {
    setShowHistory(false)
    setActiveSession({
      config: {
        mode: session.mode,
        timePerImage: session.images[0]?.timeSpent || 60,
        preset: session.preset,
      },
      images: session.images.map(img => img.path),
    })
  }, [])

  if (activeSession) {
    return (
      <SessionView
        config={activeSession.config}
        images={activeSession.images}
        presets={presets}
        audioChime={settings.audioChime}
        onEnd={handleEndSession}
        onBack={() => setActiveSession(null)}
      />
    )
  }

  return (
    <div className="app">
      <TopBar
        selectedCount={selectedImages.size}
        onManageFolders={handleManageFolders}
        onHistory={() => setShowHistory(true)}
        onStartSession={() => setShowSessionModal(true)}
      />
      <div className="main-content">
        <Sidebar
          folders={folderTrees}
          favorites={favorites}
          selectedPath={selectedPath}
          onSelectFolder={setSelectedPath}
          onSelectFavorites={() => setSelectedPath('__favorites__')}
        />
        {selectedPath ? (
          <ImageGrid
            images={currentImages}
            selectedImages={selectedImages}
            favorites={favorites}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : (
          <div className="image-grid-container">
            <div className="empty-state">
              <p>Select a folder from the sidebar to browse images</p>
              {referenceFolders.length === 0 && (
                <button className="btn btn-primary" onClick={handleManageFolders}>
                  Add Reference Folder
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <SessionModal
        isOpen={showSessionModal}
        onClose={() => setShowSessionModal(false)}
        onStart={handleStartSession}
        selectedCount={selectedImages.size}
        presets={presets}
        onSavePreset={handleSavePreset}
      />
      {showHistory && (
        <HistoryView
          sessions={sessionHistory}
          onClose={() => setShowHistory(false)}
          onRerun={handleRerunSession}
          onClearHistory={handleClearHistory}
        />
      )}
    </div>
  )
}
