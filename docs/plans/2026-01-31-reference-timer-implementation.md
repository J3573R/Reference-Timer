# Reference Timer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Electron desktop app for macOS that lets artists run timed drawing sessions using their own local image references.

**Architecture:** Electron main process handles file system access, native dialogs, and persistent storage via electron-store. Renderer process is a React app (with TypeScript) managing UI state, timer logic, and user interactions. IPC bridges the two for folder scanning and storage operations.

**Tech Stack:** Electron, React, TypeScript, electron-store, Vite (for fast dev builds)

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `index.html`

**Step 1: Initialize npm project**

Run:
```bash
cd /Users/jester/Projects/reference-timer
npm init -y
```

**Step 2: Install dependencies**

Run:
```bash
npm install electron electron-store
npm install -D typescript vite @vitejs/plugin-react react react-dom @types/react @types/react-dom @types/node electron-builder concurrently
```

**Step 3: Create package.json scripts**

Edit `package.json` to have these scripts and main entry:
```json
{
  "name": "reference-timer",
  "version": "1.0.0",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"npm run electron:dev\"",
    "electron:dev": "tsc -p tsconfig.electron.json && electron .",
    "build": "tsc -p tsconfig.electron.json && vite build",
    "package": "npm run build && electron-builder"
  }
}
```

**Step 4: Create tsconfig.json for renderer**

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

**Step 5: Create tsconfig.electron.json for main process**

Create `tsconfig.electron.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist-electron",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["electron"]
}
```

**Step 6: Create vite.config.ts**

Create `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 7: Create electron/main.ts**

Create `electron/main.ts`:
```typescript
import { app, BrowserWindow } from 'electron'
import path from 'path'

let mainWindow: BrowserWindow | null = null

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
```

**Step 8: Create electron/preload.ts**

Create `electron/preload.ts`:
```typescript
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Will add IPC methods here
})
```

**Step 9: Create index.html**

Create `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reference Timer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 10: Create src/main.tsx**

Create `src/main.tsx`:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 11: Create src/App.tsx**

Create `src/App.tsx`:
```typescript
export default function App() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Reference Timer</h1>
      <p>App is running!</p>
    </div>
  )
}
```

**Step 12: Test the app runs**

Run:
```bash
npm run dev
```

Expected: Electron window opens showing "Reference Timer" and "App is running!"

**Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + React + TypeScript project"
```

---

## Task 2: Storage Layer with electron-store

**Files:**
- Create: `electron/store.ts`
- Create: `src/types.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`

**Step 1: Create shared types**

Create `src/types.ts`:
```typescript
export interface Stage {
  duration: number  // seconds
  count: number
}

export interface ProgressivePreset {
  name: string
  stages: Stage[]
}

export interface SessionImage {
  path: string
  timeSpent: number  // seconds
}

export interface Session {
  id: string
  date: string  // ISO string
  mode: 'simple' | 'class' | 'progressive'
  preset?: string
  totalTime: number  // seconds
  complete: boolean
  images: SessionImage[]
}

export interface Settings {
  audioChime: boolean
}

export interface AppData {
  referenceFolders: string[]
  favorites: string[]
  progressivePresets: ProgressivePreset[]
  sessionHistory: Session[]
  settings: Settings
}
```

**Step 2: Create store module**

Create `electron/store.ts`:
```typescript
import Store from 'electron-store'

interface Stage {
  duration: number
  count: number
}

interface ProgressivePreset {
  name: string
  stages: Stage[]
}

interface SessionImage {
  path: string
  timeSpent: number
}

interface Session {
  id: string
  date: string
  mode: 'simple' | 'class' | 'progressive'
  preset?: string
  totalTime: number
  complete: boolean
  images: SessionImage[]
}

interface Settings {
  audioChime: boolean
}

interface AppData {
  referenceFolders: string[]
  favorites: string[]
  progressivePresets: ProgressivePreset[]
  sessionHistory: Session[]
  settings: Settings
}

const defaultPresets: ProgressivePreset[] = [
  {
    name: 'Gesture Practice',
    stages: [
      { duration: 30, count: 5 },
      { duration: 60, count: 5 },
    ],
  },
  {
    name: 'Full Study',
    stages: [
      { duration: 60, count: 3 },
      { duration: 300, count: 2 },
    ],
  },
]

export const store = new Store<AppData>({
  defaults: {
    referenceFolders: [],
    favorites: [],
    progressivePresets: defaultPresets,
    sessionHistory: [],
    settings: {
      audioChime: true,
    },
  },
})
```

**Step 3: Add IPC handlers to main.ts**

Modify `electron/main.ts` - add after imports:
```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { store } from './store'

let mainWindow: BrowserWindow | null = null

// IPC Handlers
ipcMain.handle('store:get', (_event, key: string) => {
  return store.get(key)
})

ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  store.set(key, value)
})

ipcMain.handle('store:getAll', () => {
  return store.store
})

function createWindow() {
  // ... rest unchanged
```

**Step 4: Expose IPC in preload.ts**

Modify `electron/preload.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    getAll: () => ipcRenderer.invoke('store:getAll'),
  },
})
```

**Step 5: Create type declaration for window.electronAPI**

Create `src/electron.d.ts`:
```typescript
import type { AppData } from './types'

declare global {
  interface Window {
    electronAPI: {
      store: {
        get: <K extends keyof AppData>(key: K) => Promise<AppData[K]>
        set: <K extends keyof AppData>(key: K, value: AppData[K]) => Promise<void>
        getAll: () => Promise<AppData>
      }
    }
  }
}

export {}
```

**Step 6: Test storage works**

Modify `src/App.tsx` temporarily:
```typescript
import { useEffect, useState } from 'react'

export default function App() {
  const [folders, setFolders] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.store.get('referenceFolders').then(setFolders)
  }, [])

  return (
    <div style={{ padding: '20px' }}>
      <h1>Reference Timer</h1>
      <p>Reference folders: {folders.length}</p>
    </div>
  )
}
```

Run:
```bash
npm run dev
```

Expected: App shows "Reference folders: 0" (empty array from defaults)

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: add electron-store with IPC bridge for persistent storage"
```

---

## Task 3: File System - Folder Selection and Scanning

**Files:**
- Create: `electron/fileSystem.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/electron.d.ts`

**Step 1: Create file system module**

Create `electron/fileSystem.ts`:
```typescript
import { dialog } from 'electron'
import fs from 'fs'
import path from 'path'

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

export async function selectFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

export interface FolderNode {
  name: string
  path: string
  type: 'folder' | 'image'
  children?: FolderNode[]
  exists: boolean
}

export function scanFolder(folderPath: string): FolderNode {
  const exists = fs.existsSync(folderPath)
  const node: FolderNode = {
    name: path.basename(folderPath),
    path: folderPath,
    type: 'folder',
    exists,
    children: [],
  }

  if (!exists) {
    return node
  }

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name)

      if (entry.isDirectory()) {
        node.children!.push(scanFolder(fullPath))
      } else if (entry.isFile() && isImageFile(entry.name)) {
        node.children!.push({
          name: entry.name,
          path: fullPath,
          type: 'image',
          exists: true,
        })
      }
      // Non-image files are silently ignored
    }

    // Sort: folders first, then images, alphabetically within each
    node.children!.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  } catch (error) {
    console.error(`Error scanning folder ${folderPath}:`, error)
  }

  return node
}

export function getImagesInFolder(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) {
    return []
  }

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    return entries
      .filter(entry => entry.isFile() && isImageFile(entry.name))
      .map(entry => path.join(folderPath, entry.name))
      .sort()
  } catch {
    return []
  }
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}
```

**Step 2: Add IPC handlers for file system**

Modify `electron/main.ts` - add imports and handlers:
```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { store } from './store'
import { selectFolder, scanFolder, getImagesInFolder, fileExists } from './fileSystem'

// ... existing code ...

// File system IPC handlers
ipcMain.handle('fs:selectFolder', async () => {
  return selectFolder()
})

ipcMain.handle('fs:scanFolder', (_event, folderPath: string) => {
  return scanFolder(folderPath)
})

ipcMain.handle('fs:getImagesInFolder', (_event, folderPath: string) => {
  return getImagesInFolder(folderPath)
})

ipcMain.handle('fs:fileExists', (_event, filePath: string) => {
  return fileExists(filePath)
})

// ... rest of main.ts ...
```

**Step 3: Expose file system in preload**

Modify `electron/preload.ts`:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    getAll: () => ipcRenderer.invoke('store:getAll'),
  },
  fs: {
    selectFolder: () => ipcRenderer.invoke('fs:selectFolder'),
    scanFolder: (folderPath: string) => ipcRenderer.invoke('fs:scanFolder', folderPath),
    getImagesInFolder: (folderPath: string) => ipcRenderer.invoke('fs:getImagesInFolder', folderPath),
    fileExists: (filePath: string) => ipcRenderer.invoke('fs:fileExists', filePath),
  },
})
```

**Step 4: Update type declarations**

Modify `src/electron.d.ts`:
```typescript
import type { AppData } from './types'

export interface FolderNode {
  name: string
  path: string
  type: 'folder' | 'image'
  children?: FolderNode[]
  exists: boolean
}

declare global {
  interface Window {
    electronAPI: {
      store: {
        get: <K extends keyof AppData>(key: K) => Promise<AppData[K]>
        set: <K extends keyof AppData>(key: K, value: AppData[K]) => Promise<void>
        getAll: () => Promise<AppData>
      }
      fs: {
        selectFolder: () => Promise<string | null>
        scanFolder: (folderPath: string) => Promise<FolderNode>
        getImagesInFolder: (folderPath: string) => Promise<string[]>
        fileExists: (filePath: string) => Promise<boolean>
      }
    }
  }
}

export {}
```

**Step 5: Test folder selection**

Modify `src/App.tsx`:
```typescript
import { useEffect, useState } from 'react'

export default function App() {
  const [folders, setFolders] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.store.get('referenceFolders').then(setFolders)
  }, [])

  const handleAddFolder = async () => {
    const folder = await window.electronAPI.fs.selectFolder()
    if (folder) {
      const newFolders = [...folders, folder]
      await window.electronAPI.store.set('referenceFolders', newFolders)
      setFolders(newFolders)
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Reference Timer</h1>
      <button onClick={handleAddFolder}>Add Folder</button>
      <ul>
        {folders.map(f => <li key={f}>{f}</li>)}
      </ul>
    </div>
  )
}
```

Run:
```bash
npm run dev
```

Expected: Click "Add Folder" opens native folder picker. Selected folder appears in list and persists after restart.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add file system APIs for folder selection and image scanning"
```

---

## Task 4: Main Browser UI - Layout and Folder Tree

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/ImageGrid.tsx`
- Create: `src/components/TopBar.tsx`
- Create: `src/hooks/useStore.ts`
- Create: `src/styles/main.css`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Step 1: Create useStore hook**

Create `src/hooks/useStore.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import type { AppData } from '../types'

export function useStore<K extends keyof AppData>(key: K) {
  const [value, setValue] = useState<AppData[K] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.store.get(key).then(v => {
      setValue(v)
      setLoading(false)
    })
  }, [key])

  const update = useCallback(async (newValue: AppData[K]) => {
    await window.electronAPI.store.set(key, newValue)
    setValue(newValue)
  }, [key])

  return { value, loading, update }
}
```

**Step 2: Create main styles**

Create `src/styles/main.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a1a;
  color: #e0e0e0;
  overflow: hidden;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #252525;
  border-bottom: 1px solid #333;
}

.top-bar h1 {
  font-size: 18px;
  font-weight: 600;
}

.top-bar-actions {
  display: flex;
  gap: 8px;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  background: #202020;
  border-right: 1px solid #333;
  overflow-y: auto;
  padding: 8px 0;
}

.sidebar-section {
  padding: 8px 12px;
}

.sidebar-section-title {
  font-size: 11px;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

.folder-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  gap: 8px;
}

.folder-item:hover {
  background: #2a2a2a;
}

.folder-item.selected {
  background: #3a3a3a;
}

.folder-item.missing {
  opacity: 0.5;
}

.folder-item-icon {
  font-size: 14px;
}

.folder-item-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-children {
  margin-left: 16px;
}

.image-grid-container {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.image-card {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  background: #252525;
}

.image-card:hover {
  border-color: #555;
}

.image-card.selected {
  border-color: #4a9eff;
}

.image-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-card-overlay {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
}

.favorite-btn {
  background: rgba(0,0,0,0.6);
  border: none;
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
}

.image-card:hover .favorite-btn,
.favorite-btn.active {
  opacity: 1;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary {
  background: #4a9eff;
  color: white;
}

.btn-primary:hover {
  background: #3a8eef;
}

.btn-primary:disabled {
  background: #555;
  cursor: not-allowed;
}

.btn-secondary {
  background: #333;
  color: #e0e0e0;
}

.btn-secondary:hover {
  background: #404040;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  text-align: center;
  padding: 40px;
}

.empty-state p {
  margin-bottom: 16px;
}
```

**Step 3: Create TopBar component**

Create `src/components/TopBar.tsx`:
```typescript
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
```

**Step 4: Create Sidebar component**

Create `src/components/Sidebar.tsx`:
```typescript
import type { FolderNode } from '../electron'

interface SidebarProps {
  folders: FolderNode[]
  favorites: string[]
  selectedPath: string | null
  onSelectFolder: (path: string) => void
  onSelectFavorites: () => void
}

function FolderTreeItem({
  node,
  selectedPath,
  onSelect,
  depth = 0
}: {
  node: FolderNode
  selectedPath: string | null
  onSelect: (path: string) => void
  depth?: number
}) {
  if (node.type !== 'folder') return null

  const isSelected = selectedPath === node.path
  const hasChildren = node.children && node.children.some(c => c.type === 'folder')

  return (
    <div>
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${!node.exists ? 'missing' : ''}`}
        onClick={() => onSelect(node.path)}
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <span className="folder-item-icon">{node.exists ? '📁' : '⚠️'}</span>
        <span className="folder-item-name">{node.name}</span>
      </div>
      {hasChildren && node.children!
        .filter(c => c.type === 'folder')
        .map(child => (
          <FolderTreeItem
            key={child.path}
            node={child}
            selectedPath={selectedPath}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))
      }
    </div>
  )
}

export default function Sidebar({ folders, favorites, selectedPath, onSelectFolder, onSelectFavorites }: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div
          className={`folder-item ${selectedPath === '__favorites__' ? 'selected' : ''}`}
          onClick={onSelectFavorites}
        >
          <span className="folder-item-icon">⭐</span>
          <span className="folder-item-name">Favorites ({favorites.length})</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Reference Folders</div>
        {folders.length === 0 ? (
          <p style={{ fontSize: 12, color: '#666', padding: '8px 12px' }}>
            No folders added yet
          </p>
        ) : (
          folders.map(folder => (
            <FolderTreeItem
              key={folder.path}
              node={folder}
              selectedPath={selectedPath}
              onSelect={onSelectFolder}
            />
          ))
        )}
      </div>
    </div>
  )
}
```

**Step 5: Create ImageGrid component**

Create `src/components/ImageGrid.tsx`:
```typescript
interface ImageGridProps {
  images: string[]
  selectedImages: Set<string>
  favorites: string[]
  onToggleSelect: (path: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFavorite: (path: string) => void
}

export default function ImageGrid({
  images,
  selectedImages,
  favorites,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onToggleFavorite
}: ImageGridProps) {
  if (images.length === 0) {
    return (
      <div className="image-grid-container">
        <div className="empty-state">
          <p>No images in this folder</p>
        </div>
      </div>
    )
  }

  return (
    <div className="image-grid-container">
      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onSelectAll}>
          Select All ({images.length})
        </button>
        {selectedImages.size > 0 && (
          <button className="btn btn-secondary" onClick={onClearSelection}>
            Clear Selection
          </button>
        )}
      </div>
      <div className="image-grid">
        {images.map(imagePath => {
          const isSelected = selectedImages.has(imagePath)
          const isFavorite = favorites.includes(imagePath)
          return (
            <div
              key={imagePath}
              className={`image-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggleSelect(imagePath)}
            >
              <img src={`file://${imagePath}`} alt="" loading="lazy" />
              <div className="image-card-overlay">
                <button
                  className={`favorite-btn ${isFavorite ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(imagePath)
                  }}
                >
                  {isFavorite ? '⭐' : '☆'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

**Step 6: Update main.tsx to import styles**

Modify `src/main.tsx`:
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/main.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 7: Update App.tsx with full layout**

Modify `src/App.tsx`:
```typescript
import { useEffect, useState, useCallback } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import ImageGrid from './components/ImageGrid'
import type { FolderNode } from './electron'

export default function App() {
  const [referenceFolders, setReferenceFolders] = useState<string[]>([])
  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [currentImages, setCurrentImages] = useState<string[]>([])
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())

  // Load initial data
  useEffect(() => {
    Promise.all([
      window.electronAPI.store.get('referenceFolders'),
      window.electronAPI.store.get('favorites'),
    ]).then(([folders, favs]) => {
      setReferenceFolders(folders)
      setFavorites(favs)
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

  return (
    <div className="app">
      <TopBar
        selectedCount={selectedImages.size}
        onManageFolders={handleManageFolders}
        onHistory={() => {/* TODO */}}
        onStartSession={() => {/* TODO */}}
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
    </div>
  )
}
```

**Step 8: Test the browser UI**

Run:
```bash
npm run dev
```

Expected: Dark themed UI with sidebar, folder tree, image grid. Can add folders, browse images, select images, toggle favorites.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: add main browser UI with folder tree, image grid, and favorites"
```

---

## Task 5: Session Setup Modal

**Files:**
- Create: `src/components/SessionModal.tsx`
- Create: `src/components/Modal.tsx`
- Modify: `src/styles/main.css`
- Modify: `src/App.tsx`

**Step 1: Create base Modal component**

Create `src/components/Modal.tsx`:
```typescript
import { ReactNode } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Add modal styles**

Add to `src/styles/main.css`:
```css
/* Modal styles */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-content {
  background: #252525;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.modal-header h2 {
  font-size: 18px;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.modal-close:hover {
  color: #fff;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
}

/* Session modal specific */
.mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  background: #1a1a1a;
  padding: 4px;
  border-radius: 8px;
}

.mode-tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: none;
  color: #888;
  cursor: pointer;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;
}

.mode-tab:hover {
  color: #e0e0e0;
}

.mode-tab.active {
  background: #333;
  color: #fff;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  color: #888;
  margin-bottom: 6px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #4a9eff;
}

.time-presets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.time-preset {
  padding: 8px 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
}

.time-preset:hover {
  border-color: #555;
}

.time-preset.active {
  border-color: #4a9eff;
  background: rgba(74, 158, 255, 0.1);
}

.stages-list {
  margin-top: 12px;
}

.stage-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.stage-row input {
  width: 80px;
}

.stage-row .btn-icon {
  padding: 8px;
  font-size: 16px;
}

.btn-icon {
  background: #333;
  border: none;
  color: #e0e0e0;
  border-radius: 4px;
  cursor: pointer;
}

.btn-icon:hover {
  background: #444;
}

.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #333;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-large {
  padding: 12px 32px;
  font-size: 15px;
}
```

**Step 3: Create SessionModal component**

Create `src/components/SessionModal.tsx`:
```typescript
import { useState } from 'react'
import Modal from './Modal'
import type { ProgressivePreset, Stage } from '../types'

type SessionMode = 'simple' | 'class' | 'progressive'

interface SessionConfig {
  mode: SessionMode
  timePerImage: number
  imageCount?: number
  preset?: string
  customStages?: Stage[]
}

interface SessionModalProps {
  isOpen: boolean
  onClose: () => void
  onStart: (config: SessionConfig) => void
  selectedCount: number
  presets: ProgressivePreset[]
  onSavePreset: (preset: ProgressivePreset) => void
}

const TIME_PRESETS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
]

export default function SessionModal({
  isOpen,
  onClose,
  onStart,
  selectedCount,
  presets,
  onSavePreset
}: SessionModalProps) {
  const [mode, setMode] = useState<SessionMode>('simple')
  const [timePerImage, setTimePerImage] = useState(60)
  const [customTime, setCustomTime] = useState('')
  const [imageCount, setImageCount] = useState(10)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [customStages, setCustomStages] = useState<Stage[]>([
    { duration: 30, count: 5 },
    { duration: 60, count: 5 },
  ])
  const [newPresetName, setNewPresetName] = useState('')

  const handleTimePreset = (value: number) => {
    setTimePerImage(value)
    setCustomTime('')
  }

  const handleCustomTime = (value: string) => {
    setCustomTime(value)
    const seconds = parseInt(value) || 0
    if (seconds > 0) {
      setTimePerImage(seconds)
    }
  }

  const handleAddStage = () => {
    setCustomStages([...customStages, { duration: 60, count: 5 }])
  }

  const handleRemoveStage = (index: number) => {
    setCustomStages(customStages.filter((_, i) => i !== index))
  }

  const handleStageChange = (index: number, field: 'duration' | 'count', value: number) => {
    const newStages = [...customStages]
    newStages[index] = { ...newStages[index], [field]: value }
    setCustomStages(newStages)
  }

  const handleSavePreset = () => {
    if (newPresetName.trim() && customStages.length > 0) {
      onSavePreset({ name: newPresetName.trim(), stages: customStages })
      setNewPresetName('')
    }
  }

  const handleStart = () => {
    const config: SessionConfig = {
      mode,
      timePerImage,
    }

    if (mode === 'class') {
      config.imageCount = imageCount
    } else if (mode === 'progressive') {
      if (selectedPreset && selectedPreset !== 'custom') {
        config.preset = selectedPreset
      } else {
        config.customStages = customStages
      }
    }

    onStart(config)
  }

  const getProgressiveStages = (): Stage[] => {
    if (selectedPreset && selectedPreset !== 'custom') {
      const preset = presets.find(p => p.name === selectedPreset)
      return preset?.stages || []
    }
    return customStages
  }

  const getTotalImages = (): number => {
    if (mode === 'simple') return selectedCount
    if (mode === 'class') return Math.min(imageCount, selectedCount)
    return getProgressiveStages().reduce((sum, s) => sum + s.count, 0)
  }

  const getTotalTime = (): number => {
    if (mode === 'simple') return selectedCount * timePerImage
    if (mode === 'class') return Math.min(imageCount, selectedCount) * timePerImage
    return getProgressiveStages().reduce((sum, s) => sum + s.duration * s.count, 0)
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins === 0) return `${secs}s`
    if (secs === 0) return `${mins}m`
    return `${mins}m ${secs}s`
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start Session">
      <div className="mode-tabs">
        {(['simple', 'class', 'progressive'] as const).map(m => (
          <button
            key={m}
            className={`mode-tab ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {(mode === 'simple' || mode === 'class') && (
        <div className="form-group">
          <label>Time per image</label>
          <div className="time-presets">
            {TIME_PRESETS.map(p => (
              <button
                key={p.value}
                className={`time-preset ${timePerImage === p.value && !customTime ? 'active' : ''}`}
                onClick={() => handleTimePreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            placeholder="Custom (seconds)"
            value={customTime}
            onChange={e => handleCustomTime(e.target.value)}
            style={{ marginTop: 8 }}
          />
        </div>
      )}

      {mode === 'class' && (
        <div className="form-group">
          <label>Number of images</label>
          <input
            type="number"
            min={1}
            max={selectedCount}
            value={imageCount}
            onChange={e => setImageCount(parseInt(e.target.value) || 1)}
          />
          <span style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'block' }}>
            {selectedCount} images available
          </span>
        </div>
      )}

      {mode === 'progressive' && (
        <>
          <div className="form-group">
            <label>Preset</label>
            <select
              value={selectedPreset}
              onChange={e => setSelectedPreset(e.target.value)}
            >
              <option value="">Select a preset...</option>
              {presets.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
              <option value="custom">Custom...</option>
            </select>
          </div>

          {(selectedPreset === 'custom' || selectedPreset === '') && (
            <div className="form-group">
              <label>Stages</label>
              <div className="stages-list">
                {customStages.map((stage, i) => (
                  <div key={i} className="stage-row">
                    <span style={{ color: '#888', width: 60 }}>Stage {i + 1}</span>
                    <input
                      type="number"
                      min={1}
                      value={stage.duration}
                      onChange={e => handleStageChange(i, 'duration', parseInt(e.target.value) || 1)}
                    />
                    <span style={{ color: '#888' }}>sec ×</span>
                    <input
                      type="number"
                      min={1}
                      value={stage.count}
                      onChange={e => handleStageChange(i, 'count', parseInt(e.target.value) || 1)}
                    />
                    <span style={{ color: '#888' }}>images</span>
                    {customStages.length > 1 && (
                      <button className="btn-icon" onClick={() => handleRemoveStage(i)}>×</button>
                    )}
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary" onClick={handleAddStage} style={{ marginTop: 8 }}>
                + Add Stage
              </button>

              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Preset name"
                  value={newPresetName}
                  onChange={e => setNewPresetName(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                >
                  Save Preset
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div style={{
        marginTop: 20,
        padding: 12,
        background: '#1a1a1a',
        borderRadius: 8,
        fontSize: 13,
        color: '#888'
      }}>
        <strong style={{ color: '#e0e0e0' }}>Session summary:</strong><br />
        {getTotalImages()} images • {formatTime(getTotalTime())} total
      </div>

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary btn-large" onClick={handleStart}>
          Start Session
        </button>
      </div>
    </Modal>
  )
}

export type { SessionConfig }
```

**Step 4: Wire up SessionModal in App.tsx**

Modify `src/App.tsx` - add imports and state:
```typescript
import { useEffect, useState, useCallback } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import ImageGrid from './components/ImageGrid'
import SessionModal, { type SessionConfig } from './components/SessionModal'
import type { FolderNode } from './electron'
import type { ProgressivePreset } from './types'

export default function App() {
  const [referenceFolders, setReferenceFolders] = useState<string[]>([])
  const [folderTrees, setFolderTrees] = useState<FolderNode[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [presets, setPresets] = useState<ProgressivePreset[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [currentImages, setCurrentImages] = useState<string[]>([])
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set())
  const [showSessionModal, setShowSessionModal] = useState(false)

  // Load initial data
  useEffect(() => {
    Promise.all([
      window.electronAPI.store.get('referenceFolders'),
      window.electronAPI.store.get('favorites'),
      window.electronAPI.store.get('progressivePresets'),
    ]).then(([folders, favs, prsts]) => {
      setReferenceFolders(folders)
      setFavorites(favs)
      setPresets(prsts)
    })
  }, [])

  // ... rest of existing useEffects and handlers ...

  const handleSavePreset = useCallback(async (preset: ProgressivePreset) => {
    const newPresets = [...presets, preset]
    await window.electronAPI.store.set('progressivePresets', newPresets)
    setPresets(newPresets)
  }, [presets])

  const handleStartSession = useCallback((config: SessionConfig) => {
    console.log('Starting session:', config, 'with images:', Array.from(selectedImages))
    setShowSessionModal(false)
    // TODO: Launch session view
  }, [selectedImages])

  return (
    <div className="app">
      <TopBar
        selectedCount={selectedImages.size}
        onManageFolders={handleManageFolders}
        onHistory={() => {/* TODO */}}
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
    </div>
  )
}
```

**Step 5: Test session modal**

Run:
```bash
npm run dev
```

Expected: Select images, click "Start Session", modal opens with three mode tabs. Can configure all modes. Summary shows correctly.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add session setup modal with simple, class, and progressive modes"
```

---

## Task 6: Drawing Session View

**Files:**
- Create: `src/components/SessionView.tsx`
- Create: `src/hooks/useTimer.ts`
- Modify: `src/styles/main.css`
- Modify: `src/App.tsx`

**Step 1: Create timer hook**

Create `src/hooks/useTimer.ts`:
```typescript
import { useState, useEffect, useCallback, useRef } from 'react'

interface UseTimerOptions {
  duration: number
  onComplete: () => void
}

export function useTimer({ duration, onComplete }: UseTimerOptions) {
  const [timeLeft, setTimeLeft] = useState(duration)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onComplete)

  // Keep onComplete ref updated
  onCompleteRef.current = onComplete

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    intervalRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearTimer()
          onCompleteRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [clearTimer])

  useEffect(() => {
    if (!isPaused && timeLeft > 0) {
      startTimer()
    }
    return clearTimer
  }, [isPaused, startTimer, clearTimer])

  const reset = useCallback((newDuration: number) => {
    clearTimer()
    setTimeLeft(newDuration)
    setIsPaused(false)
  }, [clearTimer])

  const togglePause = useCallback(() => {
    setIsPaused(prev => !prev)
  }, [])

  return {
    timeLeft,
    isPaused,
    togglePause,
    reset,
  }
}
```

**Step 2: Add session view styles**

Add to `src/styles/main.css`:
```css
/* Session View */
.session-view {
  position: fixed;
  inset: 0;
  background: #0a0a0a;
  display: flex;
  flex-direction: column;
  z-index: 200;
}

.session-image {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 20px;
}

.session-image.paused {
  opacity: 0.5;
}

.session-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.session-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0,0,0,0.8));
  padding: 40px 20px 20px;
}

.session-timer {
  font-size: 64px;
  font-weight: 200;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #fff;
}

.session-timer.warning {
  color: #ff6b6b;
}

.session-progress {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
  color: #888;
  font-size: 14px;
}

.session-stage {
  color: #4a9eff;
}

.session-controls {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}

.session-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.1);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.session-btn:hover {
  background: rgba(255,255,255,0.2);
}

.session-btn.primary {
  width: 70px;
  height: 70px;
  background: #4a9eff;
  font-size: 24px;
}

.session-btn.primary:hover {
  background: #3a8eef;
}

.session-btn.end {
  position: absolute;
  top: 20px;
  right: 20px;
  width: auto;
  height: auto;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
}

.paused-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 80px;
  color: rgba(255,255,255,0.3);
}

/* Session Complete */
.session-complete {
  position: fixed;
  inset: 0;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.session-complete h1 {
  font-size: 32px;
  margin-bottom: 24px;
}

.session-stats {
  display: flex;
  gap: 40px;
  margin-bottom: 32px;
}

.stat {
  text-align: center;
}

.stat-value {
  font-size: 48px;
  font-weight: 200;
  color: #4a9eff;
}

.stat-label {
  font-size: 14px;
  color: #888;
  margin-top: 4px;
}

.session-complete-actions {
  display: flex;
  gap: 12px;
}

/* Confirm dialog */
.confirm-dialog {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.confirm-dialog-content {
  background: #252525;
  padding: 24px;
  border-radius: 12px;
  text-align: center;
}

.confirm-dialog-content p {
  margin-bottom: 20px;
}

.confirm-dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
```

**Step 3: Create SessionView component**

Create `src/components/SessionView.tsx`:
```typescript
import { useState, useCallback, useEffect } from 'react'
import { useTimer } from '../hooks/useTimer'
import type { SessionConfig } from './SessionModal'
import type { Stage, Session, SessionImage } from '../types'

interface SessionViewProps {
  config: SessionConfig
  images: string[]
  presets: { name: string; stages: Stage[] }[]
  audioChime: boolean
  onEnd: (session: Session) => void
  onBack: () => void
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function buildSessionQueue(
  config: SessionConfig,
  images: string[],
  presets: { name: string; stages: Stage[] }[]
): { imagePath: string; duration: number; stageName?: string }[] {
  const shuffled = shuffleArray(images)
  const queue: { imagePath: string; duration: number; stageName?: string }[] = []

  if (config.mode === 'simple') {
    for (const img of shuffled) {
      queue.push({ imagePath: img, duration: config.timePerImage })
    }
  } else if (config.mode === 'class') {
    const count = Math.min(config.imageCount || 10, shuffled.length)
    for (let i = 0; i < count; i++) {
      queue.push({ imagePath: shuffled[i], duration: config.timePerImage })
    }
  } else if (config.mode === 'progressive') {
    let stages: Stage[]
    let stageName: string | undefined

    if (config.preset) {
      const preset = presets.find(p => p.name === config.preset)
      stages = preset?.stages || []
      stageName = config.preset
    } else {
      stages = config.customStages || []
    }

    let imageIndex = 0
    for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
      const stage = stages[stageIdx]
      for (let i = 0; i < stage.count; i++) {
        queue.push({
          imagePath: shuffled[imageIndex % shuffled.length],
          duration: stage.duration,
          stageName: stageName ? `${stageName} - Stage ${stageIdx + 1}` : `Stage ${stageIdx + 1}`,
        })
        imageIndex++
      }
    }
  }

  return queue
}

export default function SessionView({
  config,
  images,
  presets,
  audioChime,
  onEnd,
  onBack
}: SessionViewProps) {
  const [queue] = useState(() => buildSessionQueue(config, images, presets))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sessionImages, setSessionImages] = useState<SessionImage[]>([])
  const [startTime] = useState(Date.now())
  const [imageStartTime, setImageStartTime] = useState(Date.now())
  const [showConfirm, setShowConfirm] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const current = queue[currentIndex]

  const recordImageTime = useCallback(() => {
    const timeSpent = Math.round((Date.now() - imageStartTime) / 1000)
    setSessionImages(prev => [...prev, { path: current.imagePath, timeSpent }])
  }, [current?.imagePath, imageStartTime])

  const goToNext = useCallback(() => {
    if (audioChime) {
      // Simple beep using Web Audio API
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.value = 0.1
      osc.start()
      osc.stop(ctx.currentTime + 0.1)
    }

    recordImageTime()

    if (currentIndex >= queue.length - 1) {
      setIsComplete(true)
    } else {
      setCurrentIndex(prev => prev + 1)
      setImageStartTime(Date.now())
    }
  }, [currentIndex, queue.length, recordImageTime, audioChime])

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      recordImageTime()
      setCurrentIndex(prev => prev - 1)
      setImageStartTime(Date.now())
      // Remove last recorded image since we're going back
      setSessionImages(prev => prev.slice(0, -1))
    }
  }, [currentIndex, recordImageTime])

  const { timeLeft, isPaused, togglePause, reset } = useTimer({
    duration: current?.duration || 60,
    onComplete: goToNext,
  })

  // Reset timer when moving to new image
  useEffect(() => {
    if (current) {
      reset(current.duration)
    }
  }, [currentIndex, current, reset])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        togglePause()
      } else if (e.code === 'ArrowRight') {
        goToNext()
      } else if (e.code === 'ArrowLeft') {
        goToPrevious()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePause, goToNext, goToPrevious])

  const handleEndSession = useCallback(() => {
    recordImageTime()
    const totalTime = Math.round((Date.now() - startTime) / 1000)
    const session: Session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mode: config.mode,
      preset: config.preset,
      totalTime,
      complete: false,
      images: sessionImages,
    }
    onEnd(session)
  }, [recordImageTime, startTime, config, sessionImages, onEnd])

  const handleComplete = useCallback(() => {
    const totalTime = Math.round((Date.now() - startTime) / 1000)
    const session: Session = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mode: config.mode,
      preset: config.preset,
      totalTime,
      complete: true,
      images: sessionImages,
    }
    onEnd(session)
  }, [startTime, config, sessionImages, onEnd])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${secs}`
  }

  if (isComplete) {
    const totalTime = Math.round((Date.now() - startTime) / 1000)
    return (
      <div className="session-complete">
        <h1>Session Complete!</h1>
        <div className="session-stats">
          <div className="stat">
            <div className="stat-value">{sessionImages.length}</div>
            <div className="stat-label">Images</div>
          </div>
          <div className="stat">
            <div className="stat-value">{formatTime(totalTime)}</div>
            <div className="stat-label">Total Time</div>
          </div>
        </div>
        <div className="session-complete-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            Back to Browser
          </button>
          <button className="btn btn-primary" onClick={handleComplete}>
            Save & Exit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="session-view">
      <div className={`session-image ${isPaused ? 'paused' : ''}`}>
        <img src={`file://${current.imagePath}`} alt="" />
        {isPaused && <div className="paused-indicator">⏸</div>}
      </div>

      <div className="session-overlay">
        <div className={`session-timer ${timeLeft <= 5 ? 'warning' : ''}`}>
          {formatTime(timeLeft)}
        </div>
        <div className="session-progress">
          <span>{currentIndex + 1} / {queue.length}</span>
          {current.stageName && (
            <span className="session-stage">{current.stageName}</span>
          )}
        </div>
        <div className="session-controls">
          <button className="session-btn" onClick={goToPrevious} disabled={currentIndex === 0}>
            ◀
          </button>
          <button className="session-btn primary" onClick={togglePause}>
            {isPaused ? '▶' : '⏸'}
          </button>
          <button className="session-btn" onClick={goToNext}>
            ▶
          </button>
        </div>
      </div>

      <button className="session-btn end" onClick={() => setShowConfirm(true)}>
        End Session
      </button>

      {showConfirm && (
        <div className="confirm-dialog">
          <div className="confirm-dialog-content">
            <p>End session early? Progress will be saved.</p>
            <div className="confirm-dialog-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleEndSession}>
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

**Step 4: Wire up SessionView in App.tsx**

Modify `src/App.tsx` - add session view state and handler:
```typescript
import { useEffect, useState, useCallback } from 'react'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import ImageGrid from './components/ImageGrid'
import SessionModal, { type SessionConfig } from './components/SessionModal'
import SessionView from './components/SessionView'
import type { FolderNode } from './electron'
import type { ProgressivePreset, Session, Settings } from './types'

export default function App() {
  // ... existing state ...
  const [settings, setSettings] = useState<Settings>({ audioChime: true })
  const [activeSession, setActiveSession] = useState<{
    config: SessionConfig
    images: string[]
  } | null>(null)

  // Load initial data - add settings
  useEffect(() => {
    Promise.all([
      window.electronAPI.store.get('referenceFolders'),
      window.electronAPI.store.get('favorites'),
      window.electronAPI.store.get('progressivePresets'),
      window.electronAPI.store.get('settings'),
    ]).then(([folders, favs, prsts, sttngs]) => {
      setReferenceFolders(folders)
      setFavorites(favs)
      setPresets(prsts)
      setSettings(sttngs)
    })
  }, [])

  // ... existing handlers ...

  const handleStartSession = useCallback((config: SessionConfig) => {
    setShowSessionModal(false)
    setActiveSession({
      config,
      images: Array.from(selectedImages),
    })
  }, [selectedImages])

  const handleEndSession = useCallback(async (session: Session) => {
    const history = await window.electronAPI.store.get('sessionHistory')
    await window.electronAPI.store.set('sessionHistory', [...history, session])
    setActiveSession(null)
  }, [])

  // If session is active, show session view
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
    // ... rest of existing JSX unchanged ...
  )
}
```

**Step 5: Test session view**

Run:
```bash
npm run dev
```

Expected: Select images, configure session, click Start. Fullscreen session view with timer, controls, keyboard shortcuts. Session ends and saves to history.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add drawing session view with timer, controls, and keyboard shortcuts"
```

---

## Task 7: History View

**Files:**
- Create: `src/components/HistoryView.tsx`
- Modify: `src/styles/main.css`
- Modify: `src/App.tsx`

**Step 1: Add history styles**

Add to `src/styles/main.css`:
```css
/* History View */
.history-view {
  position: fixed;
  inset: 0;
  background: #1a1a1a;
  z-index: 150;
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.history-header h2 {
  font-size: 20px;
}

.history-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.history-list {
  max-width: 800px;
  margin: 0 auto;
}

.history-item {
  background: #252525;
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}

.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  cursor: pointer;
}

.history-item-header:hover {
  background: #2a2a2a;
}

.history-item-info h3 {
  font-size: 15px;
  font-weight: 500;
  margin-bottom: 4px;
}

.history-item-meta {
  font-size: 13px;
  color: #888;
  display: flex;
  gap: 16px;
}

.history-item-status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.history-item-status.complete {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}

.history-item-status.incomplete {
  background: rgba(251, 191, 36, 0.2);
  color: #fbbf24;
}

.history-item-details {
  padding: 0 16px 16px;
  border-top: 1px solid #333;
}

.history-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.history-image {
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.history-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.history-image-time {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0,0,0,0.7);
  padding: 2px 4px;
  font-size: 11px;
  text-align: center;
}

.history-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.history-empty {
  text-align: center;
  color: #666;
  padding: 60px 20px;
}
```

**Step 2: Create HistoryView component**

Create `src/components/HistoryView.tsx`:
```typescript
import { useState } from 'react'
import type { Session } from '../types'

interface HistoryViewProps {
  sessions: Session[]
  onClose: () => void
  onRerun: (session: Session) => void
  onClearHistory: () => void
}

export default function HistoryView({ sessions, onClose, onRerun, onClearHistory }: HistoryViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }

  const formatMode = (session: Session): string => {
    if (session.mode === 'progressive' && session.preset) {
      return `Progressive (${session.preset})`
    }
    return session.mode.charAt(0).toUpperCase() + session.mode.slice(1)
  }

  // Sort by date, newest first
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
                        <div key={i} className="history-image">
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
    </div>
  )
}
```

**Step 3: Wire up HistoryView in App.tsx**

Modify `src/App.tsx` - add history state and handlers:
```typescript
import HistoryView from './components/HistoryView'
import type { ProgressivePreset, Session, Settings } from './types'

export default function App() {
  // ... existing state ...
  const [sessionHistory, setSessionHistory] = useState<Session[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Load initial data - add sessionHistory
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
    // Re-run with same images
    setActiveSession({
      config: {
        mode: session.mode,
        timePerImage: session.images[0]?.timeSpent || 60,
        preset: session.preset,
      },
      images: session.images.map(img => img.path),
    })
  }, [])

  // Session view takes priority
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
      {/* ... existing main content ... */}

      {/* Modals */}
      <SessionModal ... />

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
```

**Step 4: Test history view**

Run:
```bash
npm run dev
```

Expected: Complete a session, click History, see session listed. Can expand to see images, re-run session.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add session history view with re-run capability"
```

---

## Task 8: Settings View

**Files:**
- Create: `src/components/SettingsModal.tsx`
- Modify: `src/App.tsx`

**Step 1: Create SettingsModal component**

Create `src/components/SettingsModal.tsx`:
```typescript
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
```

**Step 2: Update TopBar to include Settings button**

Modify `src/components/TopBar.tsx`:
```typescript
interface TopBarProps {
  selectedCount: number
  onManageFolders: () => void
  onHistory: () => void
  onSettings: () => void
  onStartSession: () => void
}

export default function TopBar({ selectedCount, onManageFolders, onHistory, onSettings, onStartSession }: TopBarProps) {
  return (
    <div className="top-bar">
      <h1>Reference Timer</h1>
      <div className="top-bar-actions">
        <button className="btn btn-secondary" onClick={onSettings}>
          Settings
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
```

**Step 3: Wire up SettingsModal in App.tsx**

Modify `src/App.tsx`:
```typescript
import SettingsModal from './components/SettingsModal'

export default function App() {
  // ... existing state ...
  const [showSettings, setShowSettings] = useState(false)

  // ... existing handlers ...

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

  const handleDeletePreset = useCallback(async (name: string) => {
    const newPresets = presets.filter(p => p.name !== name)
    await window.electronAPI.store.set('progressivePresets', newPresets)
    setPresets(newPresets)
  }, [presets])

  return (
    <div className="app">
      <TopBar
        selectedCount={selectedImages.size}
        onManageFolders={handleManageFolders}
        onHistory={() => setShowHistory(true)}
        onSettings={() => setShowSettings(true)}
        onStartSession={() => setShowSessionModal(true)}
      />
      {/* ... existing content ... */}

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
```

**Step 4: Test settings**

Run:
```bash
npm run dev
```

Expected: Settings modal opens. Can manage folders, cleanup favorites, toggle audio, manage presets, clear history.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add settings modal for managing folders, presets, and preferences"
```

---

## Task 9: Final Polish and Build

**Files:**
- Modify: `package.json`
- Create: `electron-builder.json`

**Step 1: Create electron-builder config**

Create `electron-builder.json`:
```json
{
  "$schema": "https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json",
  "appId": "com.reference-timer.app",
  "productName": "Reference Timer",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "dist-electron/**/*"
  ],
  "mac": {
    "category": "public.app-category.productivity",
    "target": ["dmg"]
  }
}
```

**Step 2: Update package.json for production**

Ensure `package.json` has:
```json
{
  "name": "reference-timer",
  "version": "1.0.0",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "concurrently \"vite\" \"npm run electron:dev\"",
    "electron:dev": "NODE_ENV=development tsc -p tsconfig.electron.json && electron .",
    "build": "tsc -p tsconfig.electron.json && vite build",
    "package": "npm run build && electron-builder"
  },
  "build": {
    "extends": "./electron-builder.json"
  }
}
```

**Step 3: Fix main.ts for production paths**

Modify `electron/main.ts` to handle production correctly:
```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { store } from './store'
import { selectFolder, scanFolder, getImagesInFolder, fileExists } from './fileSystem'

let mainWindow: BrowserWindow | null = null

// IPC Handlers
ipcMain.handle('store:get', (_event, key: string) => {
  return store.get(key)
})

ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
  store.set(key, value)
})

ipcMain.handle('store:getAll', () => {
  return store.store
})

ipcMain.handle('fs:selectFolder', async () => {
  return selectFolder()
})

ipcMain.handle('fs:scanFolder', (_event, folderPath: string) => {
  return scanFolder(folderPath)
})

ipcMain.handle('fs:getImagesInFolder', (_event, folderPath: string) => {
  return getImagesInFolder(folderPath)
})

ipcMain.handle('fs:fileExists', (_event, filePath: string) => {
  return fileExists(filePath)
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
```

**Step 4: Test production build**

Run:
```bash
npm run build
NODE_ENV=production npx electron .
```

Expected: App runs from built files, all features work.

**Step 5: Package the app**

Run:
```bash
npm run package
```

Expected: Creates `release/` folder with `.dmg` installer for macOS.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add production build and packaging configuration"
```

---

## Summary

This plan creates a complete Reference Timer app with:

1. **Task 1**: Project scaffolding (Electron + React + TypeScript + Vite)
2. **Task 2**: Persistent storage with electron-store
3. **Task 3**: File system APIs for folder selection and image scanning
4. **Task 4**: Main browser UI with folder tree and image grid
5. **Task 5**: Session setup modal with three modes
6. **Task 6**: Drawing session view with timer and controls
7. **Task 7**: Session history view
8. **Task 8**: Settings modal
9. **Task 9**: Production build and packaging

Each task builds on the previous, with frequent commits for safety.
