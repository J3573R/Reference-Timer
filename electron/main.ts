import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { getStore } from './store.js'
import { selectFolder, scanFolder, getSubfolders, getImagesInFolder, fileExists, getAllImagesRecursive, needsThumbnail } from './fileSystem.js'
import { ThumbnailQueue } from './thumbnailQueue.js'
import * as thumbnailCache from './thumbnailCache.js'

// Custom protocol so Chromium caches decoded bitmaps for local images.
// file:// bypasses HTTP cache, causing every render/scroll-back to re-decode from disk.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

let mainWindow: BrowserWindow | null = null

const thumbnailQueue = new ThumbnailQueue(6)

let externalPauseCount = 0
let foregroundRequestCount = 0
let currentGenerationId = 0
let windowVisible = true

async function migrateLegacyCache() {
  if (thumbnailCache.size() > 0) return // already migrated or fresh start with new entries
  const store = await getStore()
  const legacy = store.get('thumbnailCache') || {}
  const keys = Object.keys(legacy)
  if (keys.length === 0) return
  console.log(`[migration] importing ${keys.length} thumbnail cache entries from electron-store to SQLite`)
  thumbnailCache.setMany(legacy)
  store.set('thumbnailCache', {})
}

function maybeResumeBackground() {
  if (externalPauseCount === 0 && foregroundRequestCount === 0 && windowVisible) {
    thumbnailQueue.resumeBackground()
  }
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
    maybeResumeBackground()
  }
  // Feed successful results into persistent cache.
  // Return ALL results (including fallbacks where thumbPath === imgPath) so the renderer
  // caches failed attempts and doesn't retry forever for unsupported formats.
  const successful: Record<string, string> = {}
  for (const [imgPath, thumbPath] of Object.entries(results)) {
    if (thumbPath !== imgPath) {
      successful[imgPath] = thumbPath
    }
  }
  thumbnailCache.setMany(successful)
  return results
})

ipcMain.handle('fs:getCachedThumbnails', (_event, imagePaths: string[]) => {
  return thumbnailCache.getMany(imagePaths)
})

ipcMain.handle('fs:pauseBackgroundThumbnails', async () => {
  externalPauseCount++
  thumbnailQueue.pause()
})

ipcMain.handle('fs:resumeBackgroundThumbnails', async () => {
  externalPauseCount = Math.max(0, externalPauseCount - 1)
  maybeResumeBackground()
})

const BACKGROUND_BATCH_SIZE = 50

ipcMain.handle('fs:generateThumbnailsInBackground', async (_event, folderPaths: string[]) => {
  const generationId = ++currentGenerationId

  // Scan all images upfront for total count (async to avoid blocking event loop)
  const allImages: string[] = []
  for (const folderPath of folderPaths) {
    if (generationId !== currentGenerationId) return
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
          thumbnailCache.set(imagePath, thumbnailPath)
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
      backgroundThrottling: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    const port = process.env.VITE_DEV_SERVER_PORT || '5173'
    mainWindow.loadURL(`http://localhost:${port}`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('blur', () => {
    windowVisible = false
    thumbnailQueue.pause()
  })

  mainWindow.on('focus', () => {
    windowVisible = true
    maybeResumeBackground()
  })

  // Defer thumbnail cleanup to avoid I/O contention during startup
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => cleanupOrphanedThumbnails(), 30000)
  })
}

async function cleanupOrphanedThumbnails() {
  const entries = [...thumbnailCache.allEntries()]
  if (entries.length === 0) return

  const BATCH_SIZE = 50
  const orphanedKeys: string[] = []
  const orphanedFiles: string[] = []

  const exists = async (p: string): Promise<boolean> => {
    try { await fs.promises.access(p); return true } catch { return false }
  }

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)

    await Promise.allSettled(batch.map(async ({ image_path, thumbnail_path }) => {
      const parentDir = path.dirname(image_path)
      if (!(await exists(parentDir))) return // volume may be unmounted

      if (!(await exists(image_path))) {
        orphanedKeys.push(image_path)
        if (thumbnail_path && await exists(thumbnail_path)) {
          orphanedFiles.push(thumbnail_path)
        }
      }
    }))

    if (i + BATCH_SIZE < entries.length) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  if (orphanedKeys.length === 0) return

  for (let i = 0; i < orphanedFiles.length; i += BATCH_SIZE) {
    const batch = orphanedFiles.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(batch.map(file =>
      fs.promises.unlink(file).catch(() => {})
    ))
  }

  thumbnailCache.deleteMany(orphanedKeys)

  console.log(`Thumbnail cleanup: removed ${orphanedKeys.length} orphaned entries, ${orphanedFiles.length} files`)
}

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
}

app.whenReady().then(async () => {
  await migrateLegacyCache()
  protocol.handle('local', async (request) => {
    const url = new URL(request.url)
    const absolutePath = decodeURIComponent(url.pathname)
    try {
      const data = await fs.promises.readFile(absolutePath)
      const ext = path.extname(absolutePath).toLowerCase()
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream'
      return new Response(data, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400, immutable',
        },
      })
    } catch (err) {
      console.error(`[local://] failed url=${request.url} resolved=${absolutePath}`, err)
      return new Response(null, { status: 404 })
    }
  })
  createWindow()
})

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
