# Image Loading Snappiness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate perceived lag when opening image preview and advancing through images in session mode by adding prefetch preloading and thumbnail placeholders.

**Architecture:** A shared `useImagePrefetch` hook manages a sliding window of preloaded full-res images (50 ahead, 20 behind). Both `ImagePreview` and `SessionView` show the cached 200x200 thumbnail as an instant blurry placeholder while the full-res image loads, swapping to full-res on `onLoad`. If prefetch already loaded the image, the placeholder is skipped entirely.

**Tech Stack:** React hooks, browser `Image()` API for prefetching, CSS absolute positioning for layer stacking.

**Spec:** `docs/superpowers/specs/2026-03-11-image-loading-snappiness-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/hooks/useImagePrefetch.ts` | Create | Sliding window prefetch hook — manages `Image()` objects, nearest-first loading, cleanup |
| `src/components/SessionView.tsx` | Modify | Add prefetch hook + thumbnail placeholder to session image display |
| `src/components/ImagePreview.tsx` | Modify | Add prefetch hook + thumbnail placeholder with zoom/pan compatibility |
| `src/components/ImageGrid.tsx` | Modify | Thread new props (`imageList`, `currentPreviewIndex`, `thumbnailCacheRef`) to `ImagePreview` |
| `src/App.tsx` | Modify | Pass `thumbnailCacheRef` to `SessionView` |
| `src/styles/main.css` | Modify | Add CSS for thumbnail placeholder stacking in session + preview |

---

## Chunk 1: Prefetch Hook + Session View Integration

### Task 1: Create `useImagePrefetch` hook

**Files:**
- Create: `src/hooks/useImagePrefetch.ts`

- [ ] **Step 1: Create the hook file**

```typescript
import { useRef, useCallback, useEffect } from 'react'

interface PrefetchOptions {
  ahead: number
  behind: number
}

export function useImagePrefetch(
  currentIndex: number,
  imageList: string[],
  options: PrefetchOptions
) {
  const loadedSet = useRef(new Set<string>())
  const imageRefs = useRef(new Map<string, HTMLImageElement>())
  const loadingSet = useRef(new Set<string>())

  // Build nearest-first ordered list of paths within the window
  const getWindowPaths = useCallback((index: number, list: string[]) => {
    const paths: string[] = []
    const maxAhead = Math.min(options.ahead, list.length - 1 - index)
    const maxBehind = Math.min(options.behind, index)
    const maxDist = Math.max(maxAhead, maxBehind)

    for (let d = 1; d <= maxDist; d++) {
      if (d <= maxAhead) paths.push(list[index + d])
      if (d <= maxBehind) paths.push(list[index - d])
    }
    return paths
  }, [options.ahead, options.behind])

  useEffect(() => {
    const windowPaths = getWindowPaths(currentIndex, imageList)
    const windowSet = new Set(windowPaths)
    // Also include current image in the window set (don't evict it)
    if (imageList[currentIndex]) {
      windowSet.add(imageList[currentIndex])
    }

    // Clean up images outside the window
    for (const [path, img] of imageRefs.current) {
      if (!windowSet.has(path)) {
        img.src = ''
        imageRefs.current.delete(path)
        loadedSet.current.delete(path)
        loadingSet.current.delete(path)
      }
    }

    // Load images in nearest-first order, batched via microtasks
    let cancelled = false
    const loadBatch = async () => {
      for (const path of windowPaths) {
        if (cancelled) break
        if (loadedSet.current.has(path) || loadingSet.current.has(path)) continue
        if (imageRefs.current.has(path)) continue

        loadingSet.current.add(path)
        const img = new Image()
        imageRefs.current.set(path, img)

        img.onload = () => {
          loadedSet.current.add(path)
          loadingSet.current.delete(path)
        }
        img.onerror = () => {
          loadingSet.current.delete(path)
          imageRefs.current.delete(path)
        }
        img.src = `file://${path}`

        // Yield to browser between loads to avoid saturating I/O
        await new Promise(r => setTimeout(r, 0))
      }
    }

    loadBatch()

    return () => {
      cancelled = true
    }
  }, [currentIndex, imageList, getWindowPaths])

  const isLoaded = useCallback((path: string) => {
    return loadedSet.current.has(path)
  }, [])

  return { isLoaded }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/jester/Projects/reference-timer && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors related to `useImagePrefetch.ts`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useImagePrefetch.ts
git commit -m "feat: add useImagePrefetch hook for sliding window image preloading"
```

---

### Task 2: Add CSS for thumbnail placeholder stacking

**Files:**
- Modify: `src/styles/main.css`

- [ ] **Step 1: Add session image placeholder styles**

After the existing `.session-image img` rule (around line 633), add:

```css
/* Thumbnail placeholder for session images */
.session-image-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.session-image-thumbnail {
  position: absolute;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: auto;
}

.session-image-full {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
```

- [ ] **Step 2: Add preview image placeholder styles**

After the existing `.image-preview-container img` rule (around line 973), add:

```css
/* Thumbnail placeholder for preview images */
.preview-image-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  max-width: 90%;
  max-height: 90%;
}

.preview-image-thumbnail {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  position: absolute;
}

.preview-image-full {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  position: relative;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/main.css
git commit -m "feat: add CSS for thumbnail placeholder stacking in session and preview"
```

---

### Task 3: Integrate prefetch + placeholder into SessionView

**Files:**
- Modify: `src/components/SessionView.tsx` (lines 1-13 imports/props, line 78 queue, line 229-232 image rendering)
- Modify: `src/App.tsx` (lines 227-237 SessionView rendering)

- [ ] **Step 1: Add `thumbnailCacheRef` prop to SessionView**

In `src/components/SessionView.tsx`, update the imports and props interface:

```typescript
// Add to imports (line 1):
import { useState, useCallback, useEffect, type MutableRefObject } from 'react'

// Add to imports (after line 3):
import { useImagePrefetch } from '../hooks/useImagePrefetch'

// Add to SessionViewProps interface (after line 11 - audioChime):
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
```

- [ ] **Step 2: Wire up prefetch hook and memoize image paths**

In the `SessionView` function body, after line 78 (`const [queue] = useState(...)`) and before line 79 (`const [currentIndex, ...]`), add:

```typescript
  const imagePaths = useMemo(() => queue.map(q => q.imagePath), [queue])
```

After line 86 (`const current = queue[currentIndex]`), add:

```typescript
  const { isLoaded } = useImagePrefetch(currentIndex, imagePaths, { ahead: 50, behind: 20 })
  const [fullResLoaded, setFullResLoaded] = useState(false)

  // Reset fullResLoaded when image changes
  useEffect(() => {
    setFullResLoaded(false)
  }, [currentIndex])
```

Add `useMemo` to the imports on line 1.

- [ ] **Step 3: Replace bare `<img>` with placeholder pattern**

Replace the session image rendering (lines 229-232):

```typescript
// Old:
      <div className={`session-image ${isPaused ? 'paused' : ''}`}>
        <img src={`file://${current.imagePath}`} alt="" />
        {isPaused && <div className="paused-indicator">||</div>}
      </div>

// New:
      <div className={`session-image ${isPaused ? 'paused' : ''}`}>
        <div className="session-image-wrapper">
          {!fullResLoaded && !isLoaded(current.imagePath) && thumbnailCacheRef.current[current.imagePath] && (
            <img
              className="session-image-thumbnail"
              src={`file://${thumbnailCacheRef.current[current.imagePath]}`}
              alt=""
            />
          )}
          <img
            className="session-image-full"
            src={`file://${current.imagePath}`}
            alt=""
            onLoad={() => setFullResLoaded(true)}
            style={{ opacity: fullResLoaded || isLoaded(current.imagePath) ? 1 : 0 }}
          />
        </div>
        {isPaused && <div className="paused-indicator">||</div>}
      </div>
```

- [ ] **Step 4: Pass `thumbnailCacheRef` from App.tsx**

In `src/App.tsx`, update the SessionView rendering (around line 229-237):

```typescript
// Old:
      <SessionView
        config={activeSession.config}
        images={activeSession.images}
        presets={presets}
        audioChime={settings.audioChime}
        onEnd={handleEndSession}
        onBack={() => setActiveSession(null)}
      />

// New:
      <SessionView
        config={activeSession.config}
        images={activeSession.images}
        presets={presets}
        audioChime={settings.audioChime}
        onEnd={handleEndSession}
        onBack={() => setActiveSession(null)}
        thumbnailCacheRef={thumbnailCacheRef}
      />
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/jester/Projects/reference-timer && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Manual test**

Run: `cd /Users/jester/Projects/reference-timer && npm run dev`
Test: Select images, start a session. Verify:
1. First image shows thumbnail placeholder briefly (or instantly if small)
2. Advancing with arrow key or clicking next shows images faster after a few advances (prefetch kicks in)
3. Rapid-fire next clicks show blurry thumbnails instantly, swapping to full-res
4. No visual glitches, timer works normally

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionView.tsx src/App.tsx
git commit -m "feat: add prefetch and thumbnail placeholder to session view"
```

---

## Chunk 2: ImagePreview Integration

### Task 4: Thread new props through ImageGrid to ImagePreview

**Files:**
- Modify: `src/components/ImageGrid.tsx` (lines 276-285 ImagePreview rendering)
- Modify: `src/components/ImagePreview.tsx` (lines 3-10 props, lines 112-133 image rendering)

- [ ] **Step 1: Update ImagePreview props interface**

In `src/components/ImagePreview.tsx`, update the imports and props:

```typescript
// Update imports (line 1):
import { useState, useCallback, useRef, useEffect, type MutableRefObject } from 'react'

// Add import after line 1:
import { useImagePrefetch } from '../hooks/useImagePrefetch'

// Update ImagePreviewProps (lines 3-10):
interface ImagePreviewProps {
  imagePath: string
  imageList: string[]
  currentIndex: number
  thumbnailCacheRef: MutableRefObject<Record<string, string>>
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev?: boolean
  hasNext?: boolean
}
```

- [ ] **Step 2: Destructure new props and add prefetch**

Update the function signature and add prefetch hook + state:

```typescript
export default function ImagePreview({
  imagePath,
  imageList,
  currentIndex,
  thumbnailCacheRef,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
}: ImagePreviewProps) {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [fullResLoaded, setFullResLoaded] = useState(false)

  const { isLoaded } = useImagePrefetch(currentIndex, imageList, { ahead: 50, behind: 20 })

  // Reset zoom, position, and load state when image changes
  useEffect(() => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
    setFullResLoaded(false)
  }, [imagePath])
```

- [ ] **Step 3: Replace bare `<img>` with placeholder pattern (zoom/pan compatible)**

Replace the image rendering inside the container (lines 124-133):

```typescript
// Old:
        <img
          src={`file://${imagePath}`}
          alt=""
          draggable={false}
          onClick={e => e.stopPropagation()}
          style={{
            transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        />

// New:
        <div className="preview-image-wrapper">
          {!fullResLoaded && !isLoaded(imagePath) && thumbnailCacheRef.current[imagePath] && (
            <img
              className="preview-image-thumbnail"
              src={`file://${thumbnailCacheRef.current[imagePath]}`}
              alt=""
              draggable={false}
              onClick={e => e.stopPropagation()}
              style={{
                transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              }}
            />
          )}
          <img
            className="preview-image-full"
            src={`file://${imagePath}`}
            alt=""
            draggable={false}
            onClick={e => e.stopPropagation()}
            onLoad={() => setFullResLoaded(true)}
            style={{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              opacity: fullResLoaded || isLoaded(imagePath) ? 1 : 0,
            }}
          />
        </div>
```

Key details:
- Both layers get the same `transform` so zoom/pan works during loading
- Thumbnail is removed from DOM (not just hidden) once full-res loads via the conditional render
- Both images have `stopPropagation` to prevent overlay close
- `opacity: 0` on full-res until loaded; thumbnail fills the visual gap

- [ ] **Step 4: Thread props from ImageGrid**

In `src/components/ImageGrid.tsx`, update the `ImagePreview` rendering (lines 276-285):

```typescript
// Old:
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

// New:
      {previewImage && (
        <ImagePreview
          imagePath={previewImage}
          imageList={images}
          currentIndex={currentPreviewIndex}
          thumbnailCacheRef={thumbnailCacheRef}
          onClose={handleClosePreview}
          onPrev={handlePrevImage}
          onNext={handleNextImage}
          hasPrev={hasPrev}
          hasNext={hasNext}
        />
      )}
```

No other changes to `ImageGrid` — `images`, `currentPreviewIndex`, and `thumbnailCacheRef` are all already available in scope.

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/jester/Projects/reference-timer && npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Manual test**

Run: `cd /Users/jester/Projects/reference-timer && npm run dev`
Test: Browse a folder with images. Click a thumbnail to open preview. Verify:
1. Image appears instantly (thumbnail placeholder visible if full-res not yet cached)
2. Arrow key navigation shows images faster after initial few (prefetch working)
3. Zoom and pan work correctly during and after loading
4. Click overlay background to close still works
5. No double-image visual glitches
6. Thumbnail grid browsing still works perfectly (no regression)

- [ ] **Step 7: Commit**

```bash
git add src/components/ImagePreview.tsx src/components/ImageGrid.tsx
git commit -m "feat: add prefetch and thumbnail placeholder to image preview"
```
