import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getStore } from './store.js'
import { selectFolder, scanFolder, getSubfolders, getImagesInFolder, fileExists, getAllImagesRecursive, needsThumbnail } from './fileSystem.js'
import { ThumbnailQueue } from './thumbnailQueue.js'

let mainWindow: BrowserWindow | null = null

const thumbnailQueue = new ThumbnailQueue(6)

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
  const results = await thumbnailQueue.enqueueBatch(imagePaths, priority)
  // Feed results into persistent cache
  for (const [imgPath, thumbPath] of Object.entries(results)) {
    if (thumbPath !== imgPath) {
      updatePersistentCache(imgPath, thumbPath)
    }
  }
  return results
})

ipcMain.handle('fs:generateThumbnailsInBackground', async (_event, folderPaths: string[]) => {
  // Collect all images that need thumbnails
  const allImages: string[] = []
  for (const folderPath of folderPaths) {
    allImages.push(...getAllImagesRecursive(folderPath))
  }
  const needsGen = allImages.filter(needsThumbnail)

  if (needsGen.length === 0) {
    mainWindow?.webContents.send('thumbnail-progress', { current: 0, total: 0 })
    return
  }

  const total = needsGen.length
  let completed = 0

  // Enqueue ALL background images into the shared queue at low priority
  // This ensures foreground (visible) requests always take precedence
  for (const imagePath of needsGen) {
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
  }
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
