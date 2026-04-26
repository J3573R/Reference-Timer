import { useEffect, useState, useCallback, useRef } from 'react'
import TopBar from './components/TopBar'
import SettingsModal from './components/SettingsModal'
import Sidebar from './components/Sidebar'
import ImageGrid from './components/ImageGrid'
import SessionModal, { type SessionConfig } from './components/SessionModal'
import SessionView from './components/SessionView'
import HistoryView from './components/HistoryView'
import type { FolderNode } from './electron'
import type { ProgressivePreset, Session, Settings } from './types'
import { imageUrl } from './utils/imageUrl'

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

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
  const [showSettings, setShowSettings] = useState(false)
  const [thumbnailProgress, setThumbnailProgress] = useState<{ current: number; total: number } | null>(null)
  const thumbnailCacheRef = useRef<Record<string, string>>({})
  const [thumbnailCacheVersion, setThumbnailCacheVersion] = useState(0)
  const preShuffledImagesRef = useRef<string[]>([])
  const preloadedImagesRef = useRef<HTMLImageElement[]>([])

  // Load initial data
  useEffect(() => {
    Promise.all([
      window.electronAPI.store.get('referenceFolders'),
      window.electronAPI.store.get('favorites'),
      window.electronAPI.store.get('progressivePresets'),
      window.electronAPI.store.get('settings'),
      window.electronAPI.store.get('sessionHistory'),
      window.electronAPI.store.get('thumbnailCache'),
    ]).then(([folders, favs, prsts, sttngs, history, cachedThumbnails]) => {
      setReferenceFolders(folders)
      setFavorites(favs)
      setPresets(prsts)
      setSettings(sttngs)
      setSessionHistory(history)
      if (cachedThumbnails) {
        thumbnailCacheRef.current = cachedThumbnails
        setThumbnailCacheVersion(v => v + 1)
      }
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

  // Set up thumbnail IPC listeners (mount/unmount lifecycle only)
  useEffect(() => {
    window.electronAPI.fs.onThumbnailProgress((progress) => {
      if (progress.total === 0) {
        setThumbnailProgress(null)
      } else {
        setThumbnailProgress(progress)
      }
      if (progress.current >= progress.total) {
        setTimeout(() => setThumbnailProgress(null), 2000)
      }
    })

    window.electronAPI.fs.onThumbnailGenerated(({ imagePath, thumbnailPath }) => {
      thumbnailCacheRef.current[imagePath] = thumbnailPath
      // Don't bump version for every background thumbnail — batch via persist
    })

    return () => {
      window.electronAPI.fs.removeThumbnailProgressListener()
      window.electronAPI.fs.removeThumbnailGeneratedListener()
    }
  }, [])

  // Folder-scoped thumbnail generation: generate when selected folder changes
  useEffect(() => {
    if (!selectedPath || selectedPath === '__favorites__') return
    window.electronAPI.fs.generateThumbnailsInBackground([selectedPath])
  }, [selectedPath])

  // Load images when selected path changes
  // Note: We don't clear selectedImages here to allow multi-folder selection
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
  }, [selectedPath, favorites])

  // Pre-shuffle and preload first images when session modal opens
  useEffect(() => {
    if (!showSessionModal) {
      preShuffledImagesRef.current = []
      preloadedImagesRef.current = []
      return
    }

    const shuffled = shuffleArray(Array.from(selectedImages))
    preShuffledImagesRef.current = shuffled

    // Preload first ~5 images to warm the browser decode cache
    const toPreload = shuffled.slice(0, 5)
    preloadedImagesRef.current = toPreload.map(imagePath => {
      const img = new Image()
      img.src = imageUrl(imagePath)
      return img
    })
  }, [showSessionModal, selectedImages])

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
    const images = preShuffledImagesRef.current.length > 0
      ? preShuffledImagesRef.current
      : shuffleArray(Array.from(selectedImages))
    setActiveSession({ config, images })
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

  const handleUpdateSettings = useCallback(async (newSettings: Settings) => {
    await window.electronAPI.store.set('settings', newSettings)
    setSettings(newSettings)
  }, [])

  const handleRemoveFolder = useCallback(async (path: string) => {
    const newFolders = referenceFolders.filter(f => f !== path)
    await window.electronAPI.store.set('referenceFolders', newFolders)
    setReferenceFolders(newFolders)
    if (selectedPath === path) {
      setSelectedPath(null)
    }
  }, [referenceFolders, selectedPath])

  const handleCleanupFavorites = useCallback(async () => {
    const results = await Promise.all(
      favorites.map(async f => ({ path: f, exists: await window.electronAPI.fs.fileExists(f) }))
    )
    const validFavorites = results.filter(r => r.exists).map(r => r.path)
    await window.electronAPI.store.set('favorites', validFavorites)
    setFavorites(validFavorites)
  }, [favorites])

  const lastRefreshRef = useRef(0)
  const handleRefreshFolders = useCallback(() => {
    const now = Date.now()
    if (referenceFolders.length === 0 || now - lastRefreshRef.current < 500) return
    lastRefreshRef.current = now
    Promise.all(
      referenceFolders.map(f => window.electronAPI.fs.scanFolder(f))
    ).then(trees => {
      setFolderTrees(trees)
      if (selectedPath && selectedPath !== '__favorites__') {
        window.electronAPI.fs.getImagesInFolder(selectedPath).then(setCurrentImages)
        window.electronAPI.fs.generateThumbnailsInBackground([selectedPath])
      }
    })
  }, [referenceFolders, selectedPath])

  const handleDeletePreset = useCallback(async (name: string) => {
    const newPresets = presets.filter(p => p.name !== name)
    await window.electronAPI.store.set('progressivePresets', newPresets)
    setPresets(newPresets)
  }, [presets])

  const handleRerunSession = useCallback((session: Session) => {
    setShowHistory(false)
    if (session.mode === 'quickstart') {
      setActiveSession({
        config: { mode: 'quickstart' },
        images: shuffleArray(session.images.map(img => img.path)),
      })
    } else {
      setActiveSession({
        config: {
          mode: session.mode,
          timePerImage: session.images[0]?.timeSpent || 60,
          preset: session.preset,
        },
        images: shuffleArray(session.images.map(img => img.path)),
      })
    }
  }, [])

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistThumbnailCache = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      window.electronAPI.store.set('thumbnailCache', thumbnailCacheRef.current)
    }, 2000)
  }, [])

  const handleThumbnailsLoaded = useCallback((newThumbnails: Record<string, string>) => {
    Object.assign(thumbnailCacheRef.current, newThumbnails)
    setThumbnailCacheVersion(v => v + 1)
    persistThumbnailCache()
  }, [persistThumbnailCache])

  if (activeSession) {
    return (
      <SessionView
        config={activeSession.config}
        images={activeSession.images}
        presets={presets}
        audioChime={settings.audioChime}
        onEnd={handleEndSession}
        onBack={() => setActiveSession(null)}
        thumbnailCacheRef={thumbnailCacheRef}
      />
    )
  }

  return (
    <div className="app">
      <TopBar
        selectedCount={selectedImages.size}
        onHistory={() => setShowHistory(true)}
        onSettings={() => setShowSettings(true)}
        onStartSession={() => setShowSessionModal(true)}
        onRefreshFolders={handleRefreshFolders}
        hasFolders={referenceFolders.length > 0}
        thumbnailProgress={thumbnailProgress}
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
            thumbnailCacheRef={thumbnailCacheRef}
            thumbnailCacheVersion={thumbnailCacheVersion}
            onThumbnailsLoaded={handleThumbnailsLoaded}
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
      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          referenceFolders={referenceFolders}
          onAddFolder={handleManageFolders}
          onRemoveFolder={handleRemoveFolder}
          favorites={favorites}
          onCleanupFavorites={handleCleanupFavorites}
          presets={presets}
          onDeletePreset={handleDeletePreset}
          onClearHistory={handleClearHistory}
        />
      )}
    </div>
  )
}
