import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getStore } from './store.js'
import { selectFolder, scanFolder, getSubfolders, getImagesInFolder, fileExists, getAllImagesRecursive, needsThumbnail } from './fileSystem.js'
import { ThumbnailQueue } from './thumbnailQueue.js'

let mainWindow: BrowserWindow | null = null

const thumbnailQueue = new ThumbnailQueue(6)

let externalPauseCount = 0
let foregroundRequestCount = 0
let currentGenerationId = 0

// Debounced persistent cache writes — accumulates in memory, flushes every 2 seconds
let pendingCacheUpdates: Record<string, string> = {}
let cacheFlushTimer: ReturnType<typeof setTimeout> | null = null

async function updatePersistentCache(imagePath: string, thumbnailPath: string) {
  pendingCacheUpdates[imagePath] = thumbnailPath
  if (cacheFlushTimer) return // already scheduled
  cacheFlushTimer = setTimeout(async () => {
    const store = await getStore()
    const cache = store.get('thumbnailCache') || {}
    Object.assign(cache, pendingCacheUpdates)
    store.set('thumbnailCache', cache)
    pendingCacheUpdates = {}
    cacheFlushTimer = null
  }, 2000)
}

// IPC Handlers
ipcMain.handle('store:get', async (_event, key: string) => {
  const store = await getStore()
  return store.get(key as keyof typeof store.store)
})

ipcMain.handle('store:set', async (_event, key: string, value: unknown) => {
  const store = await getStore()
  store.set(key as keyof typeof store.store, value as never)
})

ipcMain.handle('store:getAll', async () => {
  const store = await getStore()
  return store.store
})

// File system handlers
ipcMain.handle('fs:selectFolder', async () => {
  return selectFolder()
})

ipcMain.handle('fs:scanFolder', (_event, folderPath: string) => {
  return scanFolder(folderPath)
})

ipcMain.handle('fs:getSubfolders', (_event, folderPath: string) => {
  return getSubfolders(folderPath)
})

ipcMain.handle('fs:getImagesInFolder', (_event, folderPath: string) => {
  return getImagesInFolder(folderPath)
})

ipcMain.handle('fs:fileExists', (_event, filePath: string) => {
  return fileExists(filePath)
})

ipcMain.handle('fs:getThumbnails', async (_event, imagePaths: string[], priority: 'high' | 'low' = 'high') => {
  if (priority === 'high') {
    foregroundRequestCount++
    thumbnailQueue.enterForeground()
  }
  const results = await thumbnailQueue.enqueueBatch(imagePaths, priority)
  if (priority === 'high') {
    foregroundRequestCount--
    if (foregroundRequestCount === 0 && externalPauseCount === 0) {
      thumbnailQueue.resumeBackground()
    }
  }
  // Feed successful results into persistent cache.
  // Return ALL results (including fallbacks where thumbPath === imgPath) so the renderer
  // caches failed attempts and doesn't retry forever for unsupported formats.
  for (const [imgPath, thumbPath] of Object.entries(results)) {
    if (thumbPath !== imgPath) {
      updatePersistentCache(imgPath, thumbPath)
    }
  }
  return results
})

ipcMain.handle('fs:pauseBackgroundThumbnails', async () => {
  externalPauseCount++
  thumbnailQueue.pause()
})

ipcMain.handle('fs:resumeBackgroundThumbnails', async () => {
  externalPauseCount = Math.max(0, externalPauseCount - 1)
  if (externalPauseCount === 0 && foregroundRequestCount === 0) {
    thumbnailQueue.resumeBackground()
  }
})

const BACKGROUND_BATCH_SIZE = 50

ipcMain.handle('fs:generateThumbnailsInBackground', async (_event, folderPaths: string[]) => {
  const generationId = ++currentGenerationId

  // Scan all images upfront for total count (async to avoid blocking event loop)
  const allImages: string[] = []
  for (const folderPath of folderPaths) {
    allImages.push(...await getAllImagesRecursive(folderPath))
  }
  // Sort alphabetically to match grid UI order for the common case (flat folder).
  // For nested folder structures, the grid shows one folder at a time via getImagesInFolder,
  // while background generation spans the whole tree. This sort is best-effort alignment.
  allImages.sort()

  // Filter in async batches — yields event loop between batches for IPC responsiveness
  const FILTER_BATCH = 100
  const needsGen: string[] = []
  for (let i = 0; i < allImages.length; i += FILTER_BATCH) {
    if (generationId !== currentGenerationId) break // bail on stale folder selection
    const batch = allImages.slice(i, i + FILTER_BATCH)
    const results = await Promise.all(
      batch.map(async (img) => ({ img, needs: await needsThumbnail(img) }))
    )
    needsGen.push(...results.filter(r => r.needs).map(r => r.img))
  }
  // If we bailed early due to stale folder, don't proceed with partial results
  if (generationId !== currentGenerationId) return

  if (needsGen.length === 0) {
    mainWindow?.webContents.send('thumbnail-progress', { current: 0, total: 0 })
    return
  }

  const total = needsGen.length
  let completed = 0
  let batchIndex = 0

  // Discard any queued background items from a previous folder
  thumbnailQueue.discardBackground()

  const enqueueNextBatch = () => {
    // Stale generation — a new folder was selected
    if (generationId !== currentGenerationId) return
    // All batches enqueued
    if (batchIndex >= needsGen.length) return

    const batchEnd = Math.min(batchIndex + BACKGROUND_BATCH_SIZE, needsGen.length)
    const batch = needsGen.slice(batchIndex, batchEnd)
    batchIndex = batchEnd

    const promises = batch.map(imagePath =>
      thumbnailQueue.enqueue(imagePath, 'low').then((thumbnailPath) => {
        completed++
        mainWindow?.webContents.send('thumbnail-progress', { current: completed, total })
        if (thumbnailPath !== imagePath) {
          updatePersistentCache(imagePath, thumbnailPath)
          mainWindow?.webContents.send('thumbnail-generated', { imagePath, thumbnailPath })
        }
      }).catch(() => {
        completed++
        mainWindow?.webContents.send('thumbnail-progress', { current: completed, total })
      })
    )
    Promise.allSettled(promises).then(() => enqueueNextBatch())
  }

  // Set up callback so batching resumes after foreground work completes
  thumbnailQueue.setOnBackgroundResumed(() => {
    if (generationId !== currentGenerationId) {
      thumbnailQueue.setOnBackgroundResumed(null)
      return
    }
    enqueueNextBatch()
  })

  // Start the first batch
  enqueueNextBatch()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local file:// images
    },
  })

  if (process.env.NODE_ENV === 'development') {
    const port = process.env.VITE_DEV_SERVER_PORT || '5173'
    mainWindow.loadURL(`http://localhost:${port}`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // Defer thumbnail cleanup to avoid I/O contention during startup
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => cleanupOrphanedThumbnails(), 30000)
  })
}

async function cleanupOrphanedThumbnails() {
  const fs = await import('fs')
  const store = await getStore()
  const cache: Record<string, string> = store.get('thumbnailCache') || {}
  const entries = Object.entries(cache)
  if (entries.length === 0) return

  const BATCH_SIZE = 50
  const orphanedKeys: string[] = []
  const orphanedFiles: string[] = []

  // Helper: returns true if path exists, false otherwise
  const exists = async (p: string): Promise<boolean> => {
    try { await fs.promises.access(p); return true } catch { return false }
  }

  // Process entries in batches, yielding between batches for IPC responsiveness
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(batch.map(async ([imagePath, thumbnailPath]) => {
      const parentDir = path.dirname(imagePath)
      if (!(await exists(parentDir))) return // volume may be unmounted

      if (!(await exists(imagePath))) {
        orphanedKeys.push(imagePath)
        if (thumbnailPath && await exists(thumbnailPath)) {
          orphanedFiles.push(thumbnailPath)
        }
      }
    }))

    // Yield to event loop between batches
    if (i + BATCH_SIZE < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  if (orphanedKeys.length === 0) return

  // Remove orphaned thumbnail files (async, batched)
  for (let i = 0; i < orphanedFiles.length; i += BATCH_SIZE) {
    const batch = orphanedFiles.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(file =>
      fs.promises.unlink(file).catch(() => {})
    ))
  }

  // Remove orphaned cache entries
  for (const key of orphanedKeys) {
    delete cache[key]
  }
  store.set('thumbnailCache', cache)

  console.log(`Thumbnail cleanup: removed ${orphanedKeys.length} orphaned entries, ${orphanedFiles.length} files`)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
