# Grid Full-Res Image Preloading Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preload full-res images for visible grid thumbnails so preview/session opens instantly.

**Architecture:** New `useGridPrefetch` hook manages a debounced priority queue with concurrency pool of 3. ImageGrid wires visibility data from react-window's `onCellsRendered` and hover events. App.tsx changes thumbnail generation from startup-all-folders to per-folder-on-select.

**Tech Stack:** React hooks, `new Image()` browser decode cache, react-window Grid API

**Spec:** `docs/superpowers/specs/2026-03-11-grid-prefetch-design.md`

---

## Chunk 1: useGridPrefetch Hook

### Task 1: Create useGridPrefetch hook

**Files:**
- Create: `src/hooks/useGridPrefetch.ts`

- [ ] **Step 1: Create `src/hooks/useGridPrefetch.ts` with full implementation**

Write the following file:

```typescript
import { useRef, useCallback, useEffect, useState, type MutableRefObject } from 'react'

const CONCURRENCY = 3
const DEBOUNCE_MS = 150
const MAX_LOADED = 200

export function useGridPrefetch(
  images: string[],
  thumbnailCacheRef: MutableRefObject<Record<string, string>>,
  thumbnailCacheVersion: number,
  enabled: boolean
) {
  // Re-render trigger for isPreloading/isPreloaded status changes
  const [, setTick] = useState(0)
  const tick = useCallback(() => setTick(v => v + 1), [])

  const queueRef = useRef<string[]>([])
  const loadingRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const loadedRef = useRef<Set<string>>(new Set())
  const visibleStartRef = useRef(0)
  const visibleEndRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enabledRef = useRef(enabled)
  const imagesRef = useRef(images)

  // Keep refs in sync
  enabledRef.current = enabled
  imagesRef.current = images

  // Process queue: start loads up to CONCURRENCY limit
  const processQueue = useCallback(() => {
    if (!enabledRef.current) return
    if (loadingRef.current.size >= CONCURRENCY) return
    if (queueRef.current.length === 0) return

    // Thumbnails-first gate: check all visible images have thumbnails
    const visibleImages = imagesRef.current.slice(visibleStartRef.current, visibleEndRef.current)
    const allThumbnailsReady = visibleImages.every(p => thumbnailCacheRef.current[p])
    if (!allThumbnailsReady) return

    while (loadingRef.current.size < CONCURRENCY && queueRef.current.length > 0) {
      const path = queueRef.current.shift()!
      if (loadedRef.current.has(path) || loadingRef.current.has(path)) continue

      const img = new Image()
      loadingRef.current.set(path, img)
      tick()

      img.onload = () => {
        loadingRef.current.delete(path)
        // Evict oldest if at cap
        if (loadedRef.current.size >= MAX_LOADED) {
          const oldest = loadedRef.current.values().next().value
          if (oldest) loadedRef.current.delete(oldest)
        }
        loadedRef.current.add(path)
        tick()
        processQueue()
      }
      img.onerror = () => {
        loadingRef.current.delete(path)
        tick()
        processQueue()
      }
      img.src = `file://${path}`
    }
  }, [thumbnailCacheRef, tick])

  // Handle debounced visible range update
  const applyVisibleRange = useCallback((start: number, end: number) => {
    visibleStartRef.current = start
    visibleEndRef.current = end

    const visiblePaths = imagesRef.current.slice(start, end)

    // Remove queued (not in-flight) images that are no longer visible
    const visibleSet = new Set(visiblePaths)
    queueRef.current = queueRef.current.filter(p => visibleSet.has(p))

    // Add newly visible images that aren't already loaded/loading/queued
    const queueSet = new Set(queueRef.current)
    for (const path of visiblePaths) {
      if (!loadedRef.current.has(path) && !loadingRef.current.has(path) && !queueSet.has(path)) {
        queueRef.current.push(path)
      }
    }

    processQueue()
  }, [processQueue])

  // Public: called from onCellsRendered, debounced internally
  const onVisibleRangeChange = useCallback((startIndex: number, endIndex: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      applyVisibleRange(startIndex, endIndex)
    }, DEBOUNCE_MS)
  }, [applyVisibleRange])

  // Public: bump a path to front of queue (hover priority)
  const prioritize = useCallback((path: string) => {
    if (loadedRef.current.has(path) || loadingRef.current.has(path)) return
    // Remove from current position if present
    queueRef.current = queueRef.current.filter(p => p !== path)
    // Add at front
    queueRef.current.unshift(path)
    processQueue()
  }, [processQueue])

  // Public: check loading/loaded state
  const isPreloading = useCallback((path: string) => {
    return loadingRef.current.has(path)
  }, [])

  const isPreloaded = useCallback((path: string) => {
    return loadedRef.current.has(path)
  }, [])

  // Re-evaluate queue when thumbnailCacheVersion changes (gate may open)
  useEffect(() => {
    processQueue()
  }, [thumbnailCacheVersion, processQueue])

  // Re-evaluate when enabled changes (resume after preview closes)
  useEffect(() => {
    if (enabled) processQueue()
  }, [enabled, processQueue])

  // Folder switch: reset everything when images array changes
  useEffect(() => {
    // Abort all in-flight loads
    for (const [, img] of loadingRef.current) {
      img.src = ''
    }
    loadingRef.current.clear()
    queueRef.current = []
    loadedRef.current.clear()
    tick()
  }, [images, tick])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, img] of loadingRef.current) {
        img.src = ''
      }
      loadingRef.current.clear()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return { onVisibleRangeChange, prioritize, isPreloading, isPreloaded }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/jester/Projects/reference-timer && npx tsc --noEmit src/hooks/useGridPrefetch.ts 2>&1 | head -20`

Expected: no errors (or only errors from missing module resolution which is fine for an isolated check)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGridPrefetch.ts
git commit -m "feat: add useGridPrefetch hook for grid full-res preloading"
```

---

## Chunk 2: ImageGrid Integration

### Task 2: Wire useGridPrefetch into ImageGrid

**Files:**
- Modify: `src/components/ImageGrid.tsx`

**Context:** ImageGrid already has `handleCellsRendered` (line 176) that stores the visible range in `visibleRangeRef`. We need to also call `onVisibleRangeChange` from the hook. The `ImageCell` component (line 33) needs `onMouseEnter` for hover priority and spinner rendering.

- [ ] **Step 1: Add hook import and call in ImageGrid component**

At the top of the file, add the import:
```typescript
import { useGridPrefetch } from '../hooks/useGridPrefetch'
```

Inside the `ImageGrid` function body (after `const loadingRef = useRef(false)` on line 128), add:
```typescript
const { onVisibleRangeChange, prioritize, isPreloading } = useGridPrefetch(
  images,
  thumbnailCacheRef,
  thumbnailCacheVersion,
  previewImage === null
)
```

- [ ] **Step 2: Wire onVisibleRangeChange into handleCellsRendered**

In the existing `handleCellsRendered` callback (line 176-189), add the `onVisibleRangeChange` call after the debounce timer setup. Replace the callback with:

```typescript
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

  // Feed visible range to grid prefetch hook
  // Note: assumes columns always span full width (columnStartIndex=0, columnStopIndex=columnCount-1)
  const startIdx = visibleCells.rowStartIndex * columnCount + visibleCells.columnStartIndex
  const endIdx = Math.min(visibleCells.rowStopIndex * columnCount + visibleCells.columnStopIndex + 1, images.length)
  onVisibleRangeChange(startIdx, endIdx)
}, [loadVisibleThumbnails, onVisibleRangeChange, columnCount, images.length])
```

- [ ] **Step 3: Add prefetch props to CellProps and ImageCell**

Add two new fields to the `CellProps` interface (after `onPreview`):
```typescript
  onHoverPrioritize: (path: string) => void
  isPreloading: (path: string) => boolean
```

Add `onHoverPrioritize` and `isPreloading` to the `ImageCell` function's destructured params (line 33-47). The full destructuring becomes:
```typescript
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
  onHoverPrioritize,
  isPreloading,
}: { columnIndex: number; rowIndex: number; style: React.CSSProperties; ariaAttributes: Record<string, unknown> } & CellProps) {
```

Update the `cellProps` memo (line 224) to include the two new fields:
```typescript
onHoverPrioritize: prioritize,
isPreloading,
```

And add to the memo deps array: `prioritize, isPreloading`

- [ ] **Step 4: Add hover handler and spinner to ImageCell render**

In `ImageCell`, add `onMouseEnter` to the `.image-card` div and a spinner element:

```tsx
return (
  <div style={{ ...style, padding: GAP / 2 }} {...ariaAttributes}>
    <div
      className={`image-card ${isSelected ? 'selected' : ''}`}
      onClick={() => onPreview(imagePath)}
      onMouseEnter={() => onHoverPrioritize(imagePath)}
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
      {isPreloading(imagePath) && (
        <div className="grid-preload-spinner" />
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
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ImageGrid.tsx
git commit -m "feat: wire useGridPrefetch into ImageGrid with hover priority and spinner"
```

---

### Task 3: Add spinner CSS

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Add spinner styles after `.image-card-placeholder` (after line 274)**

```css
/* Grid preload spinner — shown while full-res is being decoded */
.grid-preload-spinner {
  position: absolute;
  bottom: 8px;
  left: 8px;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: grid-preload-spin 0.8s linear infinite;
  pointer-events: none;
  z-index: 2;
}

@keyframes grid-preload-spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/main.css
git commit -m "feat: add grid preload spinner CSS"
```

---

## Chunk 3: Folder-Scoped Thumbnail Generation

### Task 4: Refactor App.tsx thumbnail generation

**Files:**
- Modify: `src/App.tsx:66-92`

**Context:** The current `useEffect` at line 66-92 does three things: (1) sets up IPC listeners, (2) starts background generation for all folders, (3) cleans up listeners. We need to split this into two effects: one for listeners (mount/unmount only), one for generation (keyed on `selectedPath`).

- [ ] **Step 1: Replace the single useEffect with two separate effects**

Replace lines 66-92 (the `// Start background thumbnail generation` effect) with:

```typescript
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
```

- [ ] **Step 2: Verify the app builds**

Run: `cd /Users/jester/Projects/reference-timer && npm run build 2>&1 | tail -10`

Expected: successful build with no errors

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: scope thumbnail generation to selected folder instead of all folders at startup"
```

---

## Chunk 4: Manual Verification

### Task 5: Smoke test the full feature

- [ ] **Step 1: Start dev server**

Run: `cd /Users/jester/Projects/reference-timer && npm run dev`

- [ ] **Step 2: Verify grid prefetch behavior**

Open the app, select a folder with images. Check:
1. Thumbnails load first (grid shows thumbnails)
2. After thumbnails are visible, small spinners appear in bottom-left of thumbnail cards as full-res images preload
3. Spinners disappear once preloading completes
4. Hovering over a thumbnail that hasn't loaded yet should bump it in priority (spinner may appear/disappear faster)
5. Opening preview (clicking a preloaded thumbnail) should show the full-res image instantly — no flash of blurry thumbnail

- [ ] **Step 3: Verify folder-scoped generation**

1. Open the app fresh — no thumbnail progress bar should appear until a folder is selected
2. Select a folder — thumbnail progress should appear for that folder's images only
3. Switch to another folder — new generation starts for that folder
4. Switch back to first folder — thumbnails already cached, no regeneration

- [ ] **Step 4: Verify scroll behavior**

1. Open a large folder (100+ images)
2. Scroll through the grid
3. Spinners should appear on newly visible thumbnails after ~150ms debounce
4. Scrolling quickly should not cause visible lag or excessive spinner churn

- [ ] **Step 5: Verify preview pause/resume**

1. While grid is preloading (spinners visible), click to open preview
2. Grid preloading should pause (no new loads competing with preview's prefetch)
3. Close preview — grid preloading should resume
