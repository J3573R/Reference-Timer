import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { getStore } from './store.js'

let mainWindow: BrowserWindow | null = null

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
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
