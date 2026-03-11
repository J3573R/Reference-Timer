# Thumbnail Performance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make thumbnail loading instant on app start, scrolling smooth, and folder switching non-blocking for grids of 300-1,200 images.

**Architecture:** Six sequential tasks: (1) schema update, (2) priority thumbnail queue in main process, (3) wire queue + persistent cache into IPC layer, (4) CSS for placeholders and virtualized grid, (5) App.tsx state refactor to useRef + persistent cache, (6) ImageGrid rewrite with react-window v2 Grid + visibility-aware loading.

**Tech Stack:** Electron, React, TypeScript, react-window v2 (`Grid`), Sharp, electron-store

**Spec:** `docs/superpowers/specs/2026-03-11-thumbnail-performance-design.md`

**Note:** No test framework is configured in this project. Each task ends with a manual verification step via `npm run dev`.

---

## Chunk 1: Backend Infrastructure (Tasks 1-3)

### Task 1: Update Store Schema

Add `thumbnailCache` field to the persistent store so it can be loaded on app start.

**Files:**

- Modify: `shared/types.ts`
- Modify: `electron/store.ts`

- [ ] **Step 1: Add `thumbnailCache` to `AppData` interface**

In `shared/types.ts`, add the new field to the `AppData` interface:

```typescript
export interface AppData {
  referenceFolders: string[]
  favorites: string[]
  progressivePresets: ProgressivePreset[]
  sessionHistory: Session[]
  settings: Settings
  thumbnailCache: Record<string, string>
}
```

- [ ] **Step 2: Add default value in store**

In `electron/store.ts`, add `thumbnailCache: {}` to the `defaults` object:

```typescript
const defaults: AppData = {
  referenceFolders: [],
  favorites: [],
  progressivePresets: defaultPresets,
  sessionHistory: [],
  settings: {
    audioChime: true,
  },
  thumbnailCache: {},
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts electron/store.ts
git commit -m "feat: add thumbnailCache to persistent store schema"
```

---

### Task 2: ThumbnailQueue Class

A prioritized queue that deduplicates requests and processes visible-image requests before background ones.

**Files:**

- Create: `electron/thumbnailQueue.ts`

- [ ] **Step 1: Create the ThumbnailQueue class**

Create `electron/thumbnailQueue.ts` with the following implementation:

```typescript
import { getThumbnail } from './fileSystem.js'

type Priority = 'high' | 'low'

interface QueueItem {
  imagePath: string
  priority: Priority
  resolve: (thumbnailPath: string) => void
  reject: (error: Error) => void
}

export class ThumbnailQueue {
  private queue: QueueItem[] = []
  private activeCount = 0
  private maxConcurrency: number
  private processing = false
  // Track in-flight and completed items for deduplication
  private pending = new Map<string, Promise<string>>()

  constructor(maxConcurrency = 6) {
    this.maxConcurrency = maxConcurrency
  }

  enqueue(imagePath: string, priority: Priority = 'low'): Promise<string> {
    // Deduplicate: if already pending, return existing promise
    const existing = this.pending.get(imagePath)
    if (existing) {
      // If upgrading priority, reorder won't help since it's already processing
      // but for queued items we can upgrade
      if (priority === 'high') {
        const queued = this.queue.find(item => item.imagePath === imagePath)
        if (queued) queued.priority = 'high'
      }
      return existing
    }

    const promise = new Promise<string>((resolve, reject) => {
      this.queue.push({ imagePath, priority, resolve, reject })
    })

    this.pending.set(imagePath, promise)
    this.processNext()
    return promise
  }

  enqueueBatch(imagePaths: string[], priority: Priority = 'low'): Promise<Record<string, string>> {
    const promises = imagePaths.map(p => this.enqueue(p, priority).then(thumb => ({ path: p, thumb })))
    return Promise.all(promises).then(results => {
      const record: Record<string, string> = {}
      for (const { path, thumb } of results) {
        record[path] = thumb
      }
      return record
    })
  }

  private processNext(): void {
    if (this.processing) return
    this.processing = true

    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      // Sort: high priority items first (stable sort preserves insertion order within same priority)
      this.sortQueue()
      const item = this.queue.shift()!
      this.activeCount++
      this.processItem(item)
    }

    this.processing = false
  }

  private sortQueue(): void {
    // Move all high-priority items to the front, preserving order within each priority
    const high: QueueItem[] = []
    const low: QueueItem[] = []
    for (const item of this.queue) {
      if (item.priority === 'high') {
        high.push(item)
      } else {
        low.push(item)
      }
    }
    this.queue = [...high, ...low]
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      const thumbnailPath = await getThumbnail(item.imagePath)
      item.resolve(thumbnailPath)
    } catch (error) {
      item.reject(error as Error)
    } finally {
      this.activeCount--
      this.pending.delete(item.imagePath)
      this.processNext()
    }
  }

  clear(): void {
    // Reject all queued items (not in-flight ones)
    for (const item of this.queue) {
      item.reject(new Error('Queue cleared'))
      this.pending.delete(item.imagePath)
    }
    this.queue = []
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add electron/thumbnailQueue.ts
git commit -m "feat: add ThumbnailQueue with priority and deduplication"
```

---

### Task 3: Wire Queue + Persistent Cache into IPC Layer

Replace the existing batch processing in `fileSystem.ts` with the queue. Update IPC handlers so background generation feeds the persistent cache. Add a new IPC channel for the renderer to receive cache updates.

**Files:**

- Modify: `electron/fileSystem.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/electron.d.ts`

- [ ] **Step 1: Refactor `fileSystem.ts` — remove old batch logic**

In `electron/fileSystem.ts`:

1. Remove the `getThumbnails` function (lines 170-188) entirely — the queue handles batching now.
2. Remove the `generateThumbnailsInBackground` function (lines 235-267) entirely — the queue replaces it.
3. Keep `getThumbnail` (the queue calls it), `getAllImagesRecursive`, and `needsThumbnail` (used by main.ts for background gen).
4. Export `getAllImagesRecursive` and `needsThumbnail` (they were previously internal).

- [ ] **Step 2: Update `main.ts` — use ThumbnailQueue for everything, debounced cache persistence**

Update imports:

```typescript
import { selectFolder, scanFolder, getSubfolders, getImagesInFolder, fileExists, getAllImagesRecursive, needsThumbnail } from './fileSystem.js'
import { ThumbnailQueue } from './thumbnailQueue.js'
```

Create the queue and a debounced cache persistence helper:

```typescript
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
```

Remove the old `fs:getThumbnail`, `fs:getThumbnails`, and `fs:generateThumbnailsInBackground` handlers. Replace with:

```typescript
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
```

- [ ] **Step 3: Update `preload.ts` — add `thumbnail-generated` listener, add priority param**

In `electron/preload.ts`, update `getThumbnails` to accept priority, remove `getThumbnail` (single), and add the new `onThumbnailGenerated` listener:

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    getAll: () => ipcRenderer.invoke('store:getAll'),
  },
  fs: {
    selectFolder: () => ipcRenderer.invoke('fs:selectFolder'),
    scanFolder: (folderPath: string) => ipcRenderer.invoke('fs:scanFolder', folderPath),
    getSubfolders: (folderPath: string) => ipcRenderer.invoke('fs:getSubfolders', folderPath),
    getImagesInFolder: (folderPath: string) => ipcRenderer.invoke('fs:getImagesInFolder', folderPath),
    fileExists: (filePath: string) => ipcRenderer.invoke('fs:fileExists', filePath),
    getThumbnails: (imagePaths: string[], priority: 'high' | 'low' = 'high') =>
      ipcRenderer.invoke('fs:getThumbnails', imagePaths, priority),
    generateThumbnailsInBackground: (folderPaths: string[]) =>
      ipcRenderer.invoke('fs:generateThumbnailsInBackground', folderPaths),
    onThumbnailProgress: (callback: (progress: { current: number; total: number }) => void) => {
      ipcRenderer.on('thumbnail-progress', (_event, progress) => callback(progress))
    },
    onThumbnailGenerated: (callback: (data: { imagePath: string; thumbnailPath: string }) => void) => {
      ipcRenderer.on('thumbnail-generated', (_event, data) => callback(data))
    },
    removeThumbnailProgressListener: () => {
      ipcRenderer.removeAllListeners('thumbnail-progress')
    },
    removeThumbnailGeneratedListener: () => {
      ipcRenderer.removeAllListeners('thumbnail-generated')
    },
  },
})
```

- [ ] **Step 4: Update `src/electron.d.ts` — match new API**

Update the type definitions to match the new preload API:

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
        getSubfolders: (folderPath: string) => Promise<FolderNode[]>
        getImagesInFolder: (folderPath: string) => Promise<string[]>
        fileExists: (filePath: string) => Promise<boolean>
        getThumbnails: (imagePaths: string[], priority?: 'high' | 'low') => Promise<Record<string, string>>
        generateThumbnailsInBackground: (folderPaths: string[]) => Promise<void>
        onThumbnailProgress: (callback: (progress: { current: number; total: number }) => void) => void
        onThumbnailGenerated: (callback: (data: { imagePath: string; thumbnailPath: string }) => void) => void
        removeThumbnailProgressListener: () => void
        removeThumbnailGeneratedListener: () => void
      }
    }
  }
}

export {}
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build`
Expected: May show errors in `App.tsx` or `ImageGrid.tsx` because they still reference the old API (`getThumbnail` single). This is expected — those files are updated in Tasks 5-6. Verify only that the electron/ files compile without errors:

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add electron/fileSystem.ts electron/main.ts electron/preload.ts src/electron.d.ts
git commit -m "feat: wire ThumbnailQueue into IPC, background gen feeds persistent cache"
```

---

## Chunk 2: Frontend (Tasks 4-6)

### Task 4: CSS Changes

Add placeholder shimmer animation and fix the grid container for virtualization.

**Files:**

- Modify: `src/styles/main.css`

- [ ] **Step 1: Add placeholder shimmer animation**

Add after the `.image-card img` rule (after line 245 in `main.css`):

```css
/* Thumbnail placeholder (shown while loading) */
.image-card-placeholder {
  width: 100%;
  height: 100%;
  background: var(--bg-tertiary);
  background-image: linear-gradient(
    90deg,
    var(--bg-tertiary) 0%,
    var(--bg-elevated) 50%,
    var(--bg-tertiary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

- [ ] **Step 2: Fix grid container for virtualized scrolling**

Replace the `.image-grid-container` rule (lines 178-186) with:

```css
.image-grid-container {
  flex: 1;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-primary);
}
```

The padding moves to the grid header and the Grid component handles its own scrolling.

Update the `.grid-header` rule (lines 1049-1055) to include padding:

```css
.grid-header {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 16px 20px;
  flex-shrink: 0;
}
```

Remove the `margin-bottom: 16px` since we use padding now.

- [ ] **Step 3: Replace the old `.image-grid` CSS rule**

Replace the `.image-grid` CSS grid rule (lines 201-205) since react-window's `Grid` handles layout:

```css
.image-grid {
  flex: 1;
  min-height: 0;
}
```

- [ ] **Step 4: Retarget scrollbar styles to Grid's internal scroll container**

The existing `.image-grid-container::-webkit-scrollbar` styles will no longer apply since `overflow: hidden` is set on the container. react-window's `Grid` creates an internal scrollable div. Retarget the scrollbar styles:

```css
.image-grid ::-webkit-scrollbar {
  width: 8px;
}

.image-grid ::-webkit-scrollbar-track {
  background: transparent;
}

.image-grid ::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 4px;
}
```

Remove the old `.image-grid-container::-webkit-scrollbar` rules (lines 188-199).

- [ ] **Step 5: Commit**

```bash
git add src/styles/main.css
git commit -m "style: add placeholder shimmer, fix grid container for virtualization"
```

---

### Task 5: App.tsx State Refactor

Move `thumbnailCache` from React state to `useRef`. Load persisted cache on startup. Memoize callbacks. Debounce cache persistence.

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Load persisted cache on startup + useRef**

Replace the `thumbnailCache` state (line 30) and update the initial data loading:

```typescript
// Replace this line:
const [thumbnailCache, setThumbnailCache] = useState<Record<string, string>>({})

// With:
const thumbnailCacheRef = useRef<Record<string, string>>({})
const [thumbnailCacheVersion, setThumbnailCacheVersion] = useState(0)
```

Add `useRef` to the React import:

```typescript
import { useEffect, useState, useCallback, useRef } from 'react'
```

Update the initial data loading `Promise.all` (line 34) to include `thumbnailCache`:

```typescript
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
```

- [ ] **Step 2: Add debounced cache persistence + memoized update callback**

Add a debounce ref and the persist function:

```typescript
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
```

- [ ] **Step 3: Listen for background-generated thumbnails**

Update the background generation `useEffect` (lines 61-83) to also listen for individual thumbnail results:

```typescript
useEffect(() => {
  if (referenceFolders.length === 0) return

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

  window.electronAPI.fs.generateThumbnailsInBackground(referenceFolders)

  return () => {
    window.electronAPI.fs.removeThumbnailProgressListener()
    window.electronAPI.fs.removeThumbnailGeneratedListener()
  }
}, [referenceFolders])
```

- [ ] **Step 4: Update ImageGrid props in JSX**

Replace the ImageGrid rendering (lines 234-246) with the new props:

```tsx
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
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: useRef thumbnail cache, persist to store, memoized callbacks"
```

---

### Task 6: ImageGrid Rewrite

Replace `.map()` with react-window v2 `Grid`. Implement visibility-aware thumbnail loading with placeholders.

**Files:**

- Modify: `src/components/ImageGrid.tsx`

- [ ] **Step 1: Rewrite ImageGrid with virtualized Grid**

Replace the entire `src/components/ImageGrid.tsx` with the new implementation. Key design points:

- `Grid` from react-window v2 with `cellComponent` and `cellProps`
- `onCellsRendered` tracks visible range for thumbnail loading
- `onResize` derives column count from container width
- Debounced visibility-aware thumbnail requests
- Placeholder shimmer div instead of original image fallback
- `thumbnailCacheRef` (useRef) read directly — no state dependency in loading effect

```typescript
import { useMemo, useEffect, useState, useCallback, useRef, type MutableRefObject } from 'react'
import { Grid } from 'react-window'
import ImagePreview from './ImagePreview'

interface ImageGridProps {
  images: string[]
  selectedImages: Set<string>
  favorites: string[]
  onToggleSelect: (path: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onToggleFavorite: (path: string) => void
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
  thumbnailCacheVersion: number
  onThumbnailsLoaded: (thumbnails: Record<string, string>) => void
}

const CARD_SIZE = 176 // 160px card + 16px gap
const GAP = 16

interface CellProps {
  images: string[]
  columnCount: number
  selectedImages: Set<string>
  favoritesSet: Set<string>
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
  thumbnailCacheVersion: number
  onToggleSelect: (path: string) => void
  onToggleFavorite: (path: string) => void
  onPreview: (path: string) => void
}

function ImageCell({
  ariaAttributes,
  columnIndex,
  rowIndex,
  style,
  images,
  columnCount,
  selectedImages,
  favoritesSet,
  thumbnailCacheRef,
  thumbnailCacheVersion,
  onToggleSelect,
  onToggleFavorite,
  onPreview,
}: { columnIndex: number; rowIndex: number; style: React.CSSProperties; ariaAttributes: Record<string, unknown> } & CellProps) {
  const index = rowIndex * columnCount + columnIndex
  if (index >= images.length) {
    return <div style={style} {...ariaAttributes} />
  }

  const imagePath = images[index]
  const thumbnailPath = thumbnailCacheRef.current[imagePath]
  const isSelected = selectedImages.has(imagePath)
  const isFavorite = favoritesSet.has(imagePath)

  // thumbnailCacheVersion is a passive dependency in cellProps — it triggers
  // cell re-renders when new thumbnails arrive, but the actual data is read from the ref.
  void thumbnailCacheVersion

  return (
    <div style={{ ...style, padding: GAP / 2 }} {...ariaAttributes}>
      <div
        className={`image-card ${isSelected ? 'selected' : ''}`}
        onClick={() => onPreview(imagePath)}
      >
        {thumbnailPath ? (
          <img
            src={`file://${thumbnailPath}`}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="image-card-placeholder" />
        )}
        <div
          className={`image-card-checkbox ${isSelected ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(imagePath)
          }}
          title={isSelected ? 'Deselect' : 'Select for session'}
        >
          {isSelected ? '\u2713' : ''}
        </div>
        <div className="image-card-overlay">
          <button
            className={`favorite-btn ${isFavorite ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(imagePath)
            }}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1.5l2 4 4.5.5-3.25 3 .75 4.5L8 11.5l-4 2 .75-4.5L1.5 6l4.5-.5 2-4z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill={isFavorite ? 'currentColor' : 'none'}
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ImageGrid({
  images,
  selectedImages,
  favorites,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onToggleFavorite,
  thumbnailCacheRef,
  thumbnailCacheVersion,
  onThumbnailsLoaded,
}: ImageGridProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [columnCount, setColumnCount] = useState(6)
  const visibleRangeRef = useRef<{ rowStart: number; rowStop: number; colStart: number; colStop: number } | null>(null)
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadingRef = useRef(false)

  const favoritesSet = useMemo(() => new Set(favorites), [favorites])

  const rowCount = Math.ceil(images.length / columnCount)

  // Derive column count from container resize
  const handleResize = useCallback((size: { width: number }) => {
    const cols = Math.max(1, Math.floor((size.width + GAP) / CARD_SIZE))
    setColumnCount(cols)
  }, [])

  // Visibility-aware thumbnail loading
  const loadVisibleThumbnails = useCallback(() => {
    const range = visibleRangeRef.current
    if (!range || loadingRef.current) return

    // Compute visible image indices
    const startIdx = range.rowStart * columnCount + range.colStart
    const endIdx = Math.min(range.rowStop * columnCount + range.colStop + 1, images.length)

    // Extend by 2 rows overscan for preloading
    const overscanStart = Math.max(0, startIdx - columnCount * 2)
    const overscanEnd = Math.min(images.length, endIdx + columnCount * 2)

    const uncached: string[] = []
    for (let i = overscanStart; i < overscanEnd; i++) {
      const img = images[i]
      if (img && !thumbnailCacheRef.current[img]) {
        uncached.push(img)
      }
    }

    if (uncached.length === 0) return

    loadingRef.current = true
    window.electronAPI.fs.getThumbnails(uncached, 'high')
      .then((results) => {
        onThumbnailsLoaded(results)
      })
      .catch(console.error)
      .finally(() => {
        loadingRef.current = false
        // Re-check: if user scrolled during loading, new visible images may need loading
        loadVisibleThumbnails()
      })
  }, [images, columnCount, onThumbnailsLoaded])

  const handleCellsRendered = useCallback((
    visibleCells: { columnStartIndex: number; columnStopIndex: number; rowStartIndex: number; rowStopIndex: number }
  ) => {
    visibleRangeRef.current = {
      rowStart: visibleCells.rowStartIndex,
      rowStop: visibleCells.rowStopIndex,
      colStart: visibleCells.columnStartIndex,
      colStop: visibleCells.columnStopIndex,
    }

    // Debounce: load thumbnails 100ms after scroll stops
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current)
    loadTimerRef.current = setTimeout(loadVisibleThumbnails, 100)
  }, [loadVisibleThumbnails])

  // Load visible thumbnails when images change (folder switch)
  useEffect(() => {
    // Small delay to let Grid render and fire onCellsRendered first
    const timer = setTimeout(loadVisibleThumbnails, 150)
    return () => clearTimeout(timer)
  }, [images, loadVisibleThumbnails])

  // Preview navigation
  const currentPreviewIndex = previewImage ? images.indexOf(previewImage) : -1
  const hasPrev = currentPreviewIndex > 0
  const hasNext = currentPreviewIndex < images.length - 1

  const handlePreview = useCallback((path: string) => {
    setPreviewImage(path)
  }, [])

  const handlePrevImage = useCallback(() => {
    if (currentPreviewIndex > 0) {
      setPreviewImage(images[currentPreviewIndex - 1])
    }
  }, [currentPreviewIndex, images])

  const handleNextImage = useCallback(() => {
    if (currentPreviewIndex < images.length - 1) {
      setPreviewImage(images[currentPreviewIndex + 1])
    }
  }, [currentPreviewIndex, images])

  const handleClosePreview = useCallback(() => {
    setPreviewImage(null)
  }, [])

  // Memoize cellProps to avoid unnecessary Grid re-renders
  const cellProps: CellProps = useMemo(() => ({
    images,
    columnCount,
    selectedImages,
    favoritesSet,
    thumbnailCacheRef,
    thumbnailCacheVersion,
    onToggleSelect,
    onToggleFavorite,
    onPreview: handlePreview,
  // thumbnailCacheRef is a stable ref — excluded from deps intentionally
  }), [images, columnCount, selectedImages, favoritesSet, thumbnailCacheVersion, onToggleSelect, onToggleFavorite, handlePreview])

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
      <div className="grid-header">
        <button className="btn btn-secondary" onClick={onSelectAll}>
          Select All ({images.length})
        </button>
        {selectedImages.size > 0 && (
          <button className="btn btn-secondary" onClick={onClearSelection}>
            Clear Selection
          </button>
        )}
        <span className="grid-info">
          {images.length} images
        </span>
      </div>
      <div className="image-grid">
        <Grid
          cellComponent={ImageCell}
          cellProps={cellProps}
          columnCount={columnCount}
          columnWidth={CARD_SIZE}
          rowCount={rowCount}
          rowHeight={CARD_SIZE}
          overscanCount={3}
          onCellsRendered={handleCellsRendered}
          onResize={handleResize}
        />
      </div>

      {previewImage && (
        <ImagePreview
          imagePath={previewImage}
          onClose={handleClosePreview}
          onPrev={handlePrevImage}
          onNext={handleNextImage}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean compile with no TypeScript errors.

- [ ] **Step 3: Manual test — run dev**

Run: `npm run dev`

Verify:

1. Open the app — folders load, click a folder
2. Grid shows placeholder shimmer cards that fill in as thumbnails load
3. Only visible thumbnails load first (check DevTools Network/Console)
4. Scrolling is smooth — placeholders appear for unloaded images
5. Switching folders is instant (shows placeholders, no freeze)
6. Selection (checkbox), favorites (star), and preview (click) all work
7. Select All / Clear Selection work
8. Close app, reopen — thumbnails appear immediately (persisted cache)

- [ ] **Step 4: Commit**

```bash
git add src/components/ImageGrid.tsx
git commit -m "feat: virtualized grid with visibility-aware thumbnail loading"
```

---

### Task 7: Final Integration Verification

Verify the full flow end-to-end and clean up.

**Files:**

- Possibly modify: any file if issues found

- [ ] **Step 1: Full integration test**

Run: `npm run dev`

Test these scenarios:

1. **Fresh start (no thumbnails):** Delete `~/Library/Application Support/reference-timer/thumbnails/` directory. Open app, select a folder. Verify visible thumbnails load first, background progress shows in TopBar.
2. **Warm start (thumbnails cached):** Close and reopen app. Thumbnails should appear instantly.
3. **Folder switching:** Click between folders rapidly. No freezing, instant placeholder display.
4. **Favorites view:** Click favorites — thumbnails load for the visible favorites.
5. **Image preview:** Click an image, navigate with arrows. Works correctly.
6. **Session flow:** Select images, start a session, verify timer works.

- [ ] **Step 2: Production build**

Run: `npm run build && npm run package`
Expected: Builds and packages without errors.

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for thumbnail performance"
```
