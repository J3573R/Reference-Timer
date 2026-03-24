# Main Process Async I/O Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 4–17+ seconds of main process event loop blocking at 10k–100k image scale by converting synchronous file system calls to async equivalents and deferring startup I/O.

**Architecture:** All changes are sync→async conversions in the Electron main process (`electron/fileSystem.ts` and `electron/main.ts`), plus one 1-line scheduling change and one 1-line debounce reduction in the renderer. No architectural changes, no new dependencies, no IPC protocol changes.

**Tech Stack:** Electron (Node.js main process), `fs.promises` API, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-24-main-process-async-io-design.md`

**Testing:** No test framework is configured. Verification is `npm run build` (TypeScript compilation) + manual smoke test via `npm run dev`.

---

### Task 1: Cache `getThumbnailsDir()`

**Files:**
- Modify: `electron/fileSystem.ts:10-17`

Eliminates 100k+ redundant `fs.existsSync` calls by caching the result after first invocation.

- [ ] **Step 1: Add cached variable and early return**

Replace `getThumbnailsDir` (lines 10-17) with:

```typescript
// Get or create thumbnails directory (cached after first call)
let cachedThumbnailsDir: string | null = null

function getThumbnailsDir(): string {
  if (cachedThumbnailsDir) return cachedThumbnailsDir
  const thumbnailsDir = path.join(app.getPath('userData'), 'thumbnails')
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true })
  }
  cachedThumbnailsDir = thumbnailsDir
  return thumbnailsDir
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 3: Commit**

```bash
git add electron/fileSystem.ts
git commit -m "perf: cache getThumbnailsDir to eliminate redundant existsSync calls"
```

---

### Task 2: Convert `getThumbnail()` sync fs to async

**Files:**
- Modify: `electron/fileSystem.ts:138-169`

Replace the synchronous `existsSync` + `statSync` cache check with `fs.promises.stat`. The function already returns `Promise<string>` — no signature change, no caller updates needed.

- [ ] **Step 1: Replace sync cache check with async stat**

Replace `getThumbnail` (lines 138-169) with:

```typescript
// Generate a thumbnail for an image, returns the thumbnail path
export async function getThumbnail(imagePath: string): Promise<string> {
  const thumbnailPath = getThumbnailPath(imagePath)

  // Return cached thumbnail if it exists and is newer than the original
  try {
    const [thumbStat, origStat] = await Promise.all([
      fs.promises.stat(thumbnailPath),
      fs.promises.stat(imagePath),
    ])
    if (thumbStat.mtimeMs > origStat.mtimeMs) {
      return thumbnailPath
    }
  } catch {
    // Thumbnail doesn't exist or can't stat — fall through to generate
  }

  try {
    await sharp(imagePath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath)

    return thumbnailPath
  } catch (error) {
    console.error(`Error generating thumbnail for ${imagePath}:`, error)
    // Return original path as fallback
    return imagePath
  }
}
```

Key change: `fs.existsSync` + `fs.statSync` → `Promise.all([fs.promises.stat, fs.promises.stat])` in a try/catch. If either stat fails (thumbnail doesn't exist), the catch falls through to Sharp generation. Behavior is identical.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation. `ThumbnailQueue.processItem` already `await`s `getThumbnail`, so the async change is transparent.

- [ ] **Step 3: Commit**

```bash
git add electron/fileSystem.ts
git commit -m "perf: convert getThumbnail cache check from sync to async fs"
```

---

### Task 3: Convert `getAllImagesRecursive()` to async

**Files:**
- Modify: `electron/fileSystem.ts:171-196`
- Modify: `electron/main.ts:111-112` (caller)

- [ ] **Step 1: Rewrite function to async**

Replace `getAllImagesRecursive` (lines 171-196) with:

```typescript
// Recursively find all images in a folder tree
export async function getAllImagesRecursive(folderPath: string): Promise<string[]> {
  const images: string[] = []

  try {
    await fs.promises.access(folderPath)
  } catch {
    return images
  }

  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name)
      if (entry.isDirectory()) {
        images.push(...await getAllImagesRecursive(fullPath))
      } else if (entry.isFile() && isImageFile(entry.name)) {
        images.push(fullPath)
      }
    }
  } catch (error) {
    console.error(`Error scanning folder ${folderPath}:`, error)
  }

  return images
}
```

- [ ] **Step 2: Update caller in main.ts**

In `electron/main.ts`, replace lines 110-113:

```typescript
  // Scan all images upfront for total count
  const allImages: string[] = []
  for (const folderPath of folderPaths) {
    allImages.push(...getAllImagesRecursive(folderPath))
  }
```

With:

```typescript
  // Scan all images upfront for total count (async to avoid blocking event loop)
  const allImages: string[] = []
  for (const folderPath of folderPaths) {
    allImages.push(...await getAllImagesRecursive(folderPath))
  }
```

The handler is already `async`, so adding `await` is safe.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add electron/fileSystem.ts electron/main.ts
git commit -m "perf: convert getAllImagesRecursive from sync to async fs"
```

---

### Task 4: Convert `needsThumbnail()` to async with batched filter

**Files:**
- Modify: `electron/fileSystem.ts:198-213`
- Modify: `electron/main.ts:119` (caller — replace sync filter with async batched filter)

This is the highest-impact fix. The sync filter blocks the main process for 4–15s at 100k images.

- [ ] **Step 1: Rewrite `needsThumbnail` to async**

Replace `needsThumbnail` (lines 198-213) with:

```typescript
// Check if a thumbnail needs to be generated (doesn't exist or is outdated)
export async function needsThumbnail(imagePath: string): Promise<boolean> {
  const thumbnailPath = getThumbnailPath(imagePath)

  try {
    const [thumbStat, origStat] = await Promise.all([
      fs.promises.stat(thumbnailPath),
      fs.promises.stat(imagePath),
    ])
    return thumbStat.mtimeMs <= origStat.mtimeMs
  } catch {
    return true
  }
}
```

- [ ] **Step 2: Replace sync filter with async batched filter in main.ts**

In `electron/main.ts`, replace line 119:

```typescript
  const needsGen = allImages.filter(needsThumbnail)
```

With:

```typescript
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
```

Note the `generationId` check at the top of the loop — if the user switches folders while the filter is running (which could take seconds at scale), we bail out early instead of wasting I/O on stale data.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 4: Commit**

```bash
git add electron/fileSystem.ts electron/main.ts
git commit -m "perf: convert needsThumbnail to async with batched filter

The synchronous needsThumbnail filter blocked the main process for
4-15s at 100k images. Now uses async fs.promises.stat in batches of
100 with generationId guard for early bailout on folder switch."
```

---

### Task 5: Defer cache cleanup at startup

**Files:**
- Modify: `electron/main.ts:193-194`

- [ ] **Step 1: Wrap cleanup call in setTimeout**

In `electron/main.ts`, replace lines 192-195:

```typescript
  // Run thumbnail cleanup after window loads, in the background
  mainWindow.webContents.once('did-finish-load', () => {
    cleanupOrphanedThumbnails()
  })
```

With:

```typescript
  // Defer thumbnail cleanup to avoid I/O contention during startup
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => cleanupOrphanedThumbnails(), 30000)
  })
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "perf: defer orphaned thumbnail cleanup 30s after startup"
```

---

### Task 6: Reduce thumbnail load debounce

**Files:**
- Modify: `src/components/ImageGrid.tsx:211`

- [ ] **Step 1: Change debounce from 100ms to 50ms**

In `src/components/ImageGrid.tsx`, replace line 211:

```typescript
    loadTimerRef.current = setTimeout(loadVisibleThumbnails, 100)
```

With:

```typescript
    loadTimerRef.current = setTimeout(loadVisibleThumbnails, 50)
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Clean compilation.

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageGrid.tsx
git commit -m "perf: reduce thumbnail load debounce from 100ms to 50ms"
```

---

### Task 7: Smoke test

- [ ] **Step 1: Run `npm run dev` and verify:**
  - App starts without stutter (cleanup is deferred)
  - Select a folder with many images — grid responds immediately, thumbnails start loading without delay
  - Scroll fast through the grid — thumbnails appear promptly after scroll stops
  - Open session modal — pre-shuffle and preload still work
  - Start a session — timer, image transitions, keyboard shortcuts all work
  - Background thumbnail generation still shows progress in top bar
