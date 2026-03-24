# Startup Performance & Timer-Image Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix slow app startup caused by synchronous thumbnail cleanup, make the session timer wait for image load, and preload session images while the config modal is open.

**Architecture:** Three independent changes: (1) rewrite `cleanupOrphanedThumbnails` in the main process to use async batched I/O, (2) coordinate timer start with image `onLoad` in SessionView, (3) pre-shuffle and preload images in App.tsx when the session modal opens so the first images are already decoded when the session starts.

**Tech Stack:** Electron (main process Node.js), React 18, TypeScript

**Note:** No test framework is configured in this project. Verification is done via `npm run build` (TypeScript + Vite) and manual smoke testing with `npm run dev`.

---

### Task 1: Async Batched Thumbnail Cleanup

**Files:**
- Modify: `electron/main.ts:198-237` (rewrite `cleanupOrphanedThumbnails`)

This task converts the synchronous cleanup function to async batched I/O so it doesn't block the main process event loop.

- [ ] **Step 1: Rewrite `cleanupOrphanedThumbnails` to async batched**

Replace the entire function body (lines 198-237) with:

```typescript
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
```

Key changes from the original:
- `fs.existsSync()` replaced with async `fs.promises.access()` wrapped in try/catch
- Entries processed in batches of 50 with `Promise.allSettled()` for concurrency within each batch
- `setTimeout(0)` yield between batches keeps event loop responsive
- `fs.unlinkSync` replaced with `fs.promises.unlink` in batches
- Same unmounted-volume guard (skip if parent dir missing)

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean compile, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "perf: convert thumbnail cleanup to async batched I/O

Replace synchronous fs.existsSync/unlinkSync calls with async
fs.promises.access/unlink processed in batches of 50, yielding
between batches to keep the main process event loop responsive."
```

---

### Task 2: Move `shuffleArray` to App.tsx, Remove Shuffle from `buildSessionQueue`

**Files:**
- Modify: `src/components/SessionView.tsx:17-24,31` (remove `shuffleArray`, update `buildSessionQueue`)
- Modify: `src/App.tsx` (add `shuffleArray`, update `handleStartSession` and `handleRerunSession`)

This task decouples the shuffle from queue building so App.tsx can pre-shuffle before the session starts.

- [ ] **Step 1: Remove `shuffleArray` from SessionView and stop shuffling in `buildSessionQueue`**

In `src/components/SessionView.tsx`:

Delete the `shuffleArray` function (lines 17-24).

Then update `buildSessionQueue` (line 31) to use `images` directly instead of shuffling:

Replace:
```typescript
  const shuffled = shuffleArray(images)
  const queue: { imagePath: string; duration: number; stageName?: string }[] = []

  if (config.mode === 'simple') {
    for (const img of shuffled) {
```

With:
```typescript
  const queue: { imagePath: string; duration: number; stageName?: string }[] = []

  if (config.mode === 'simple') {
    for (const img of images) {
```

Also replace all remaining references to `shuffled` with `images` inside `buildSessionQueue`:
- Line 39: `const count = Math.min(config.imageCount || 10, shuffled.length)` → `images.length`
- Line 41: `queue.push({ imagePath: shuffled[i], ...` → `images[i]`
- Line 60: `imagePath: shuffled[imageIndex % shuffled.length]` → `images[imageIndex % images.length]`

- [ ] **Step 2: Add `shuffleArray` to App.tsx and pre-shuffle in `handleStartSession` and `handleRerunSession`**

In `src/App.tsx`, add the `shuffleArray` function before the `App` component:

```typescript
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
```

Update `handleStartSession` (lines 153-159) to pass pre-shuffled images:

```typescript
  const handleStartSession = useCallback((config: SessionConfig) => {
    setShowSessionModal(false)
    setActiveSession({
      config,
      images: shuffleArray(Array.from(selectedImages)),
    })
  }, [selectedImages])
```

Update `handleRerunSession` (lines 202-212) to re-shuffle:

```typescript
  const handleRerunSession = useCallback((session: Session) => {
    setShowHistory(false)
    setActiveSession({
      config: {
        mode: session.mode,
        timePerImage: session.images[0]?.timeSpent || 60,
        preset: session.preset,
      },
      images: shuffleArray(session.images.map(img => img.path)),
    })
  }, [])
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean compile. SessionView no longer references `shuffleArray`. `buildSessionQueue` uses `images` directly.

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionView.tsx src/App.tsx
git commit -m "refactor: move shuffleArray to App.tsx, remove shuffle from buildSessionQueue

buildSessionQueue now trusts the input order. App.tsx pre-shuffles
in handleStartSession and handleRerunSession. This prepares for
preloading the first images while the session modal is open."
```

---

### Task 3: Pre-shuffle and Preload Images When Session Modal Opens

**Files:**
- Modify: `src/App.tsx` (add preload effect and ref, update `handleStartSession` to use pre-shuffled ref)

This task warms the browser's decoded image cache for the first ~5 session images while the user configures session options.

- [ ] **Step 1: Add pre-shuffle ref and preload effect**

In `src/App.tsx`, add a ref to hold pre-shuffled images and preloaded Image objects. Place these near the other refs (after line 31):

```typescript
  const preShuffledImagesRef = useRef<string[]>([])
  const preloadedImagesRef = useRef<HTMLImageElement[]>([])
```

Add an effect that shuffles and preloads when the modal opens. Place after the `showSessionModal` state declaration area:

```typescript
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
      img.src = `file://${imagePath}`
      return img
    })
  }, [showSessionModal, selectedImages])
```

- [ ] **Step 2: Update `handleStartSession` to use pre-shuffled images**

Replace the existing `handleStartSession`:

```typescript
  const handleStartSession = useCallback((config: SessionConfig) => {
    setShowSessionModal(false)
    const images = preShuffledImagesRef.current.length > 0
      ? preShuffledImagesRef.current
      : shuffleArray(Array.from(selectedImages))
    setActiveSession({ config, images })
  }, [selectedImages])
```

This uses the pre-shuffled array if available (normal flow), falling back to a fresh shuffle (defensive).

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean compile, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "perf: preload first 5 session images when config modal opens

Shuffle selectedImages into a ref when the session modal opens and
start decoding the first 5 images via new Image(). Image objects are
kept alive in a ref to prevent GC from evicting them from the browser
cache. handleStartSession uses the pre-shuffled array."
```

---

### Task 4: Timer Waits for Full Image Load

**Files:**
- Modify: `src/components/SessionView.tsx:86,94-97,104-134,147-151` (merge effects, update goToNext/goToPrevious, add fullResLoaded watcher)

This task makes the countdown timer wait until the full-resolution image is decoded before starting.

- [ ] **Step 1: Add a `waitingForLoadRef` to distinguish "waiting for image" from "user paused"**

In `src/components/SessionView.tsx`, add a ref near the other state declarations (after the `fullResLoaded` state, around line 92):

```typescript
  const waitingForLoadRef = useRef(true)
```

Also add `useRef` to the imports if not already present (it is already imported on line 1).

This ref is `true` when the timer is paused because we're waiting for the image to load, and `false` when the user explicitly paused/reset. This prevents the `fullResLoaded` effect from overriding the user's R-key reset.

- [ ] **Step 2: Replace the two separate effects with one merged effect**

Delete the existing `fullResLoaded` reset effect (lines 94-97):

```typescript
  // Reset fullResLoaded when image changes
  useEffect(() => {
    setFullResLoaded(false)
  }, [currentIndex])
```

And replace the `currentIndex` timer effect (lines 147-151):

```typescript
  useEffect(() => {
    if (current) {
      reset(current.duration)
    }
  }, [currentIndex, current, reset])
```

With a single merged effect:

```typescript
  // When image changes: check if already prefetched, pause timer until loaded
  useEffect(() => {
    if (!current) return

    if (isLoaded(current.imagePath)) {
      setFullResLoaded(true)
      waitingForLoadRef.current = false
      reset(current.duration)
      setImageStartTime(Date.now())
    } else {
      setFullResLoaded(false)
      waitingForLoadRef.current = true
      resetAndStop(current.duration)
    }
  }, [currentIndex, current, reset, resetAndStop, isLoaded])
```

- [ ] **Step 3: Add effect to start timer when `fullResLoaded` becomes true**

Add a new effect right after the merged effect above. This handles the case where the image wasn't prefetched and loads via the `<img onLoad>` handler:

```typescript
  // Start timer when full-res image finishes loading (only if waiting for load, not user-paused)
  useEffect(() => {
    if (fullResLoaded && current && waitingForLoadRef.current) {
      waitingForLoadRef.current = false
      reset(current.duration)
      setImageStartTime(Date.now())
    }
  }, [fullResLoaded, current, reset])
```

The `waitingForLoadRef` guard ensures this only fires when the timer is paused because we're waiting for the image to load. If the user pressed R (reset) or Space (pause) while the image was loading, `waitingForLoadRef` would be `false` (set by `handleResetTimer`), so the auto-start is suppressed.

- [ ] **Step 4: Update `handleResetTimer` to clear `waitingForLoadRef`**

Update `handleResetTimer` to signal that the pause is user-initiated:

```typescript
  const handleResetTimer = useCallback(() => {
    if (current) {
      waitingForLoadRef.current = false
      resetAndStop(current.duration)
    }
  }, [current, resetAndStop])
```

- [ ] **Step 5: Remove `setImageStartTime(Date.now())` from `goToNext` and `goToPrevious`**

In `goToNext` (around line 122-123), remove the `setImageStartTime` call:

Replace:
```typescript
    } else {
      setCurrentIndex(prev => prev + 1)
      setImageStartTime(Date.now())
    }
```

With:
```typescript
    } else {
      setCurrentIndex(prev => prev + 1)
    }
```

In `goToPrevious` (around line 130-131), remove the `setImageStartTime` call:

Replace:
```typescript
      recordImageTime()
      setCurrentIndex(prev => prev - 1)
      setImageStartTime(Date.now())
      setSessionImages(prev => prev.slice(0, -1))
```

With:
```typescript
      recordImageTime()
      setCurrentIndex(prev => prev - 1)
      setSessionImages(prev => prev.slice(0, -1))
```

`imageStartTime` is now set in the effects from Steps 1-2, when the image is actually visible.

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Clean compile, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionView.tsx
git commit -m "feat: timer waits for full-res image load before starting

Merge fullResLoaded reset and currentIndex timer effects into one.
Timer starts paused (resetAndStop) and only begins counting when
fullResLoaded becomes true. If the image was already prefetched,
the timer starts immediately. imageStartTime now tracks actual
image visibility for accurate drawing time recording."
```

---

### Task 5: Smoke Test

No automated tests are configured. Verify the changes manually.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify startup performance**

Open the app with a folder containing many images. Check the dev console for the cleanup log message (`Thumbnail cleanup: removed X orphaned entries, Y files`). Confirm the app is responsive during startup — thumbnails should start loading immediately without a multi-second freeze.

- [ ] **Step 3: Verify session timer waits for image**

1. Select some images and open the session modal
2. Click "Start Session"
3. Observe: the timer should NOT start counting down until the full-resolution image is visible
4. When the image is already prefetched (e.g., next images after the first), the timer should start immediately
5. Press R to reset — timer should pause, requiring Space to resume
6. Navigate with arrow keys — timer should wait for each new image to load

- [ ] **Step 4: Verify preloading**

1. Select images and open the session modal
2. Wait 2-3 seconds while configuring
3. Click "Start Session"
4. The first image should appear nearly instantly (already decoded in browser cache)

- [ ] **Step 5: Verify rerun session**

1. Complete or end a session
2. Go to History and click "Rerun" on a past session
3. Confirm images appear in a new shuffled order (not the recorded order)
4. Confirm timer waits for image load as in Step 3
