# Viewport-Priority Thumbnail Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make thumbnail generation prioritize visible grid cells so that thumbnails appear immediately in viewport order, while background generation yields to all foreground and renderer I/O work.

**Architecture:** The `ThumbnailQueue` gains foreground/background modes with pause/resume. Background generation switches from flood-the-queue to lazy batching (50 at a time). Renderer hooks signal the main process to pause background work during full-res loading. No new processes or worker threads.

**Tech Stack:** Electron IPC, Sharp (unchanged), React hooks, react-window

**Spec:** `docs/superpowers/specs/2026-03-22-viewport-priority-thumbnails-design.md`

**Note:** No test framework is configured for this project. Verification is manual via `npm run dev` and `npm run build`.

---

### Task 1: ThumbnailQueue — Add pause/resume and discardBackground

**Files:**
- Modify: `electron/thumbnailQueue.ts` (full file, 107 lines)

This is the foundation. All other tasks depend on these queue capabilities.

- [ ] **Step 1: Add paused state and pause/resume methods**

Add a `paused` boolean field and `pause()`/`resume()` methods. When paused, `processNext()` should skip dequeueing low-priority items but still process high-priority items.

```typescript
// Add these fields to the class:
private paused = false
private resumeTimer: ReturnType<typeof setTimeout> | null = null
```

```typescript
// Add these methods:
pause(): void {
  this.paused = true
  if (this.resumeTimer) {
    clearTimeout(this.resumeTimer)
    this.resumeTimer = null
  }
}

resume(): void {
  this.paused = false
  this.processNext()
}
```

- [ ] **Step 2: Update processNext to respect paused state**

In the `while` loop in `processNext()`, after `sortQueue()` and before `shift()`, check: if the next item is low priority and queue is paused, break out of the loop. High-priority items still process even when paused.

```typescript
private processNext(): void {
  if (this.processing) return
  this.processing = true

  while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
    this.sortQueue()
    // When paused, only process high-priority items
    if (this.paused && this.queue[0].priority === 'low') break
    const item = this.queue.shift()!
    this.activeCount++
    this.processItem(item)
  }

  this.processing = false
}
```

- [ ] **Step 3: Add discardBackground method**

This removes all low-priority items from the queue, resolving their promises with the original path (matching the fallback pattern) to avoid memory leaks from orphaned promises. It also cleans up their dedup entries in the `pending` Map so they can be re-enqueued later. No progress events are fired.

```typescript
discardBackground(): void {
  const kept: QueueItem[] = []
  for (const item of this.queue) {
    if (item.priority === 'low') {
      // Resolve with original path (fallback pattern) to avoid orphaned promises
      item.resolve(item.imagePath)
      this.pending.delete(item.imagePath)
    } else {
      kept.push(item)
    }
  }
  this.queue = kept
}
```

Note: Resolving with `imagePath` (same as the fallback for failed Sharp ops) means the `.then` handler in the batch feeder will see `thumbnailPath === imagePath`, skip `updatePersistentCache`, and increment `completed`. This is acceptable — the progress counter advances for discarded items, but the batch feeder's `Promise.allSettled` will resolve and call `enqueueNextBatch()`, which checks the generation ID and stops if stale.

- [ ] **Step 4: Add enterForeground method**

Combines pause + discard + process for a clean API. Called when viewport thumbnail requests arrive.

```typescript
enterForeground(): void {
  this.pause()
  this.discardBackground()
}
```

- [ ] **Step 5: Add resumeBackground method with quiet period**

Resumes background processing after a 500ms quiet period. Resets the timer if called again within the window.

```typescript
resumeBackground(): void {
  if (this.resumeTimer) clearTimeout(this.resumeTimer)
  this.resumeTimer = setTimeout(() => {
    this.resumeTimer = null
    this.resume()
  }, 500)
}
```

- [ ] **Step 6: Add onBackgroundResumed callback**

The lazy batch feeder in main.ts needs to know when background mode resumes so it can enqueue the next batch. Add a callback mechanism.

```typescript
// Add field:
private onBackgroundResumed: (() => void) | null = null

// Add method:
setOnBackgroundResumed(callback: (() => void) | null): void {
  this.onBackgroundResumed = callback
}
```

Update `resume()` to call this callback:

```typescript
resume(): void {
  this.paused = false
  this.processNext()
  this.onBackgroundResumed?.()
}
```

- [ ] **Step 7: Verify build compiles**

```bash
npm run build
```

Expected: compiles without errors. No runtime changes yet — existing callers still work because new methods are additive.

- [ ] **Step 8: Commit**

```bash
git add electron/thumbnailQueue.ts
git commit -m "feat: add pause/resume and foreground/background modes to ThumbnailQueue"
```

---

### Task 2: Main process — Foreground mode trigger in fs:getThumbnails and new IPC channels

**Files:**
- Modify: `electron/main.ts:65-77` (fs:getThumbnails handler)
- Modify: `electron/main.ts` (add new IPC handlers after line 77)

- [ ] **Step 1: Add pause reference counter**

At the top of `main.ts` (after `thumbnailQueue` declaration, line 9), add a reference counter for external pause requests (hover, session prefetch). This ensures overlapping pause sources don't accidentally resume too early.

```typescript
let externalPauseCount = 0
```

- [ ] **Step 2: Add foreground request counter and update fs:getThumbnails**

In the `fs:getThumbnails` handler (line 65), use a foreground request counter to prevent overlapping viewport batches from prematurely resuming background mode. Two rapid scroll-stop events (e.g., the 150ms `useEffect` timer followed by the 100ms `onCellsRendered` debounce) could otherwise cause the first batch's completion to resume background while the second batch is still processing.

Add the counter near `externalPauseCount`:

```typescript
let foregroundRequestCount = 0
```

Update the handler:

```typescript
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
  // Filter out fallback entries and feed successful results into persistent cache
  const filtered: Record<string, string> = {}
  for (const [imgPath, thumbPath] of Object.entries(results)) {
    if (thumbPath !== imgPath) {
      filtered[imgPath] = thumbPath
      updatePersistentCache(imgPath, thumbPath)
    }
  }
  return filtered
})
```

The `foregroundRequestCount` ensures `resumeBackground()` only fires when ALL in-flight viewport batches have completed, not just the first one.

- [ ] **Step 3: Add pause/resume IPC handlers**

Add new IPC handlers for renderer-initiated pause/resume (hover prefetch, session prefetch):

```typescript
ipcMain.handle('fs:pauseBackgroundThumbnails', async () => {
  externalPauseCount++
  thumbnailQueue.pause()
})

ipcMain.handle('fs:resumeBackgroundThumbnails', async () => {
  externalPauseCount = Math.max(0, externalPauseCount - 1)
  if (externalPauseCount === 0) {
    thumbnailQueue.resumeBackground()
  }
})
```

- [ ] **Step 4: Verify build compiles**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat: trigger foreground mode on viewport requests, add pause/resume IPC"
```

---

### Task 3: Lazy batch enqueueing for background generation

**Files:**
- Modify: `electron/main.ts:79-110` (fs:generateThumbnailsInBackground handler)

- [ ] **Step 1: Add generation ID tracking**

At the top of `main.ts` (near `externalPauseCount`), add a generation counter for folder-switch cancellation:

```typescript
let currentGenerationId = 0
```

- [ ] **Step 2: Rewrite the generateThumbnailsInBackground handler**

Replace the current handler (lines 79-110) with lazy batch enqueueing. Key changes:
- Scan all images upfront for total count, but only enqueue 50 at a time
- Track position with a batch index
- Check generation ID before each batch to handle folder switches
- Sort images to match grid order (alphabetical path sort, matching `getImagesInFolder`)
- Use `onBackgroundResumed` callback to resume batching after foreground work

```typescript
const BACKGROUND_BATCH_SIZE = 50

ipcMain.handle('fs:generateThumbnailsInBackground', async (_event, folderPaths: string[]) => {
  const generationId = ++currentGenerationId

  // Scan all images upfront for total count
  const allImages: string[] = []
  for (const folderPath of folderPaths) {
    allImages.push(...getAllImagesRecursive(folderPath))
  }
  // Sort alphabetically to match grid UI order for the common case (flat folder).
  // For nested folder structures, the grid shows one folder at a time via getImagesInFolder,
  // while background generation spans the whole tree. This sort is best-effort alignment —
  // images from the selected folder will cluster together alphabetically, but subfolder
  // images will be intermixed. This is acceptable since the primary viewport-ordering
  // mechanism is the foreground mode (Task 2), not background sort order.
  allImages.sort()

  const needsGen = allImages.filter(needsThumbnail)

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
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: replace flood-the-queue with lazy batch enqueueing for background thumbnails"
```

---

### Task 4: Preload bridge and TypeScript types

**Files:**
- Modify: `electron/preload.ts:9-31` (fs object)
- Modify: `src/electron.d.ts:19-31` (fs interface)

- [ ] **Step 1: Add new IPC methods to preload bridge**

In `electron/preload.ts`, add the two new methods inside the `fs` object (after `generateThumbnailsInBackground`, before `onThumbnailProgress`):

```typescript
pauseBackgroundThumbnails: () => ipcRenderer.invoke('fs:pauseBackgroundThumbnails'),
resumeBackgroundThumbnails: () => ipcRenderer.invoke('fs:resumeBackgroundThumbnails'),
```

- [ ] **Step 2: Add TypeScript types**

In `src/electron.d.ts`, add the type declarations inside the `fs` interface (after `generateThumbnailsInBackground`, before `onThumbnailProgress`):

```typescript
pauseBackgroundThumbnails: () => Promise<void>
resumeBackgroundThumbnails: () => Promise<void>
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add electron/preload.ts src/electron.d.ts
git commit -m "feat: expose pauseBackgroundThumbnails/resumeBackgroundThumbnails via preload bridge"
```

---

### Task 5: ImageGrid — Viewport-ordered thumbnail loading

**Files:**
- Modify: `src/components/ImageGrid.tsx:150-183` (loadVisibleThumbnails function)

The current `loadVisibleThumbnails` computes uncached images by iterating `overscanStart` to `overscanEnd`. The images are already in array-index order which corresponds to visual top-to-bottom, left-to-right order (since the grid lays out by index). So the ordering is already correct.

The only change needed: the `fs:getThumbnails` call already uses `'high'` priority (line 173), and Task 2 already makes that trigger foreground mode. No additional signaling is needed from the renderer.

**Spec deviation (design improvement):** The spec says "Signal foreground mode when sending visible thumbnail requests" from the renderer. Instead, we trigger foreground mode server-side in the `fs:getThumbnails` IPC handler (Task 2) when `priority === 'high'`. This is cleaner — the renderer doesn't need to know about queue modes, and there's no race condition between a separate "enter foreground" signal and the actual thumbnail request.

- [ ] **Step 1: Verify the ordering is correct**

Read through `loadVisibleThumbnails` and confirm: the `for` loop at line 163 iterates `i` from `overscanStart` to `overscanEnd` in ascending order, pushing to `uncached[]`. Since `images[]` is sorted and the grid renders left-to-right then top-to-bottom by index, this is already visual order. No change needed.

- [ ] **Step 2: Mark task complete — no code changes required**

The foreground mode trigger is handled in Task 2 (main process side). The renderer already sends images in the correct order.

- [ ] **Step 3: Commit (no-op — nothing to commit)**

No changes to this file.

---

### Task 6: useHoverPrefetch — Pause/resume background on hover

**Files:**
- Modify: `src/hooks/useHoverPrefetch.ts:18-41` (onHover callback) and `src/hooks/useHoverPrefetch.ts:43-45` (onLeave callback)

- [ ] **Step 1: Add pause signal to onHover**

In the `onHover` callback, after the early returns and before creating the `new Image()`, call `pauseBackgroundThumbnails`. This ensures background thumbnail generation yields disk I/O to the full-res load.

```typescript
const onHover = useCallback((path: string) => {
  if (loadedRef.current.has(path)) return

  cancel()

  // Don't compete with thumbnail loading — only start full-res once thumbnail is cached
  if (!thumbnailCacheRef.current[path]) return

  // Pause background thumbnail generation to free disk I/O for full-res load
  window.electronAPI.fs.pauseBackgroundThumbnails()

  const img = new Image()
  loadingRef.current = { path, img }

  img.onload = () => {
    if (loadingRef.current?.path === path) {
      loadedRef.current.add(path)
      loadingRef.current = null
    }
    window.electronAPI.fs.resumeBackgroundThumbnails()
  }
  img.onerror = () => {
    if (loadingRef.current?.path === path) {
      loadingRef.current = null
    }
    window.electronAPI.fs.resumeBackgroundThumbnails()
  }
  img.src = `file://${path}`
}, [cancel, thumbnailCacheRef])
```

- [ ] **Step 2: Add resume signal to cancel helper**

Update the `cancel` callback to resume background thumbnails when cancelling an in-flight load (mouse leave or new hover replacing old one). Note: `cancel()` is also called during folder-switch cleanup (existing `useEffect` at line 48-51). This is safe — `cancel()` only calls `resumeBackgroundThumbnails` when `loadingRef.current` is truthy, so no spurious resume fires on a clean folder switch.

```typescript
const cancel = useCallback(() => {
  if (loadingRef.current) {
    loadingRef.current.img.src = ''
    loadingRef.current = null
    window.electronAPI.fs.resumeBackgroundThumbnails()
  }
}, [])
```

- [ ] **Step 3: Verify build compiles**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useHoverPrefetch.ts
git commit -m "feat: pause background thumbnails during hover full-res prefetch"
```

---

### Task 7: useImagePrefetch — Pause/resume background on mount/unmount

**Files:**
- Modify: `src/hooks/useImagePrefetch.ts:30-84` (main useEffect)

- [ ] **Step 1: Add pause on mount, resume on unmount**

Add a new `useEffect` that pauses background thumbnails when the hook mounts and resumes when it unmounts. This covers both `SessionView` and `ImagePreview` use cases.

Add this after the existing `useEffect` (after line 84):

```typescript
// Pause background thumbnail generation while session/preview is active
useEffect(() => {
  window.electronAPI.fs.pauseBackgroundThumbnails()
  return () => {
    window.electronAPI.fs.resumeBackgroundThumbnails()
  }
}, [])
```

- [ ] **Step 2: Verify build compiles**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useImagePrefetch.ts
git commit -m "feat: pause background thumbnails during session/preview prefetch"
```

---

### Task 8: Manual verification and build check

**Files:** None (verification only)

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 2: Manual smoke test with dev server**

```bash
npm run dev
```

Test the following scenarios:
1. **Open a large folder** — thumbnails should fill in top-to-bottom, row by row
2. **Scroll quickly** — thumbnails should load for the new visible area, not the old one
3. **Hover over a cell** — full-res should load without lag from background work
4. **Open preview (click image)** — image should display promptly
5. **Switch folders** — old folder's background generation should stop, new folder starts fresh
6. **Leave app idle** — background generation should resume and progress badge should advance

- [ ] **Step 3: Commit (if any fixes needed)**

Only if smoke testing reveals issues that need fixing.
