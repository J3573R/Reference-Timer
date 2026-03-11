# Grid Full-Res Image Preloading Design

## Problem

When a user clicks a grid thumbnail to open preview or starts a session, the full-res image must be decoded on demand. With large reference images (8-20+ MP), this causes a visible delay. The existing `useImagePrefetch` hook only activates once preview/session is already open — it can't help with the first image.

## Solution

Preload full-res images for visible grid thumbnails in the background, so the browser's decode cache already contains them when the user clicks. Combined with the existing thumbnail placeholder fallback, this makes image opening feel instant.

## Design

### 1. `useGridPrefetch` Hook

A new React hook that preloads full-res images for the visible portion of the grid.

**File:** `src/hooks/useGridPrefetch.ts`

**Interface:**
```typescript
function useGridPrefetch(
  images: string[],
  thumbnailCacheRef: React.MutableRefObject<Record<string, string>>,
  thumbnailCacheVersion: number,
  enabled: boolean
): {
  onVisibleRangeChange: (startIndex: number, endIndex: number) => void;
  prioritize: (path: string) => void;
  isPreloading: (path: string) => boolean;
  isPreloaded: (path: string) => boolean;
}
```

**Inputs:**
- `images` — the image paths displayed in the grid.
- `thumbnailCacheRef` — for the thumbnails-first gate check.
- `thumbnailCacheVersion` — triggers re-evaluation of the thumbnails-first gate when new thumbnails arrive. The hook uses this as a dependency to wake up from idle when thumbnails become available.
- `enabled` — set to `false` when preview or session is open, pausing all prefetch activity (no new loads started, in-flight loads are not aborted). Set to `true` when the grid is the active view. This prevents grid prefetch from competing with `useImagePrefetch` for disk I/O.

**Queue management:**
- Maintains an ordered queue of image paths to preload, populated from the visible range in grid order.
- `prioritize(path)` bumps an image to position 0 in the queue (used on hover). No-op if already loaded or in-flight. If the path is not currently in the queue (e.g., removed during scroll debounce then hovered before re-queue), it is added at position 0.

**Concurrency pool:**
- Up to 3 concurrent `new Image()` loads via `src = file://${path}`.
- On each completion (load or error), pulls the next path from the queue.
- Tracks state per path: idle, loading (in-flight), or loaded.
- `isPreloading(path)` returns true for in-flight images.
- `isPreloaded(path)` returns true for successfully loaded images.

**Thumbnails-first gate:**
- Before starting any full-res loads, checks that every image in the current visible range has an entry in `thumbnailCacheRef.current`.
- If any visible image lacks a thumbnail, the hook idles. When `thumbnailCacheVersion` changes, the hook re-evaluates the gate.
- Wake-up mechanism: ImageGrid's existing `loadVisibleThumbnails` calls `getThumbnails` for visible images, which calls `handleThumbnailsLoaded` on completion, which bumps `thumbnailCacheVersion`. This is the correct timing — the gate opens after thumbnails for the visible area have been fetched and cached.
- Note: `onThumbnailGenerated` (background generation) writes to `thumbnailCacheRef` but does not bump the version. This is fine — the gate relies on the version bump from the visibility-aware `getThumbnails` path, which is what actually loads the thumbnails the user is about to see.
- This prevents full-res decode work from competing with thumbnail loading for disk I/O.

**Scroll handling (debounced):**
- `onVisibleRangeChange` is debounced internally (~150ms) to avoid queue churn during fast scrolling.
- When the debounced visible range updates:
  - Remove any queued (not yet in-flight) images that left the visible area.
  - Do not abort the 3 in-flight loads — they're nearly done and aborting wastes the work already spent.
  - Queue newly visible images in grid order.

**Loaded set eviction:**
- The loaded set is capped at 200 entries. When the cap is reached, the oldest entries (by insertion order) are evicted from tracking. The browser's own cache may still retain the decoded bitmaps, but the hook stops tracking them. This bounds memory growth when scrolling through large folders.

**Folder switch:**
- When the `images` array reference changes (user opens a different folder), abort all in-flight loads (`src = ''`), clear the queue, and clear the loaded/loading sets. Start fresh. Note: `images` comes from React state (`currentImages` in App.tsx), which only produces a new reference on actual folder changes — not on unrelated re-renders.

**Empty images:**
- The hook is always called (React rules of hooks) and behaves as a no-op when `images` is empty — no queue processing, no loads started.

**Cleanup:**
- On unmount, set `src = ''` on all in-flight `Image` objects before dereferencing.

### 2. ImageGrid Integration

**File:** `src/components/ImageGrid.tsx`

**Visibility tracking:**
- ImageGrid already has an `onCellsRendered` handler that receives `{ columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex }` from react-window's Grid component, and stores the range in `visibleRangeRef`.
- Compute image index range using the existing pattern: `startIndex = rowStartIndex * columnCount + columnStartIndex`, `endIndex = Math.min(rowStopIndex * columnCount + columnStopIndex + 1, images.length)`.
- Pass to `onVisibleRangeChange` from within the existing `handleCellsRendered` callback.
- Assumption: columns always span the full grid width (`columnStartIndex = 0`, `columnStopIndex = columnCount - 1`). This matches the existing thumbnail loading code and the fixed-width grid layout.

**Hover priority:**
- Add `onMouseEnter` on each thumbnail cell, calling `prioritize(imagePath)`.

**Loading spinner:**
- In the thumbnail cell render, check `isPreloading(imagePath)`.
- If true, render a small CSS-only spinner element positioned absolute in the bottom-left corner of the thumbnail card.
- Spinner disappears when `isPreloaded(imagePath)` returns true (no replacement indicator).

**Pause during preview/session:**
- Pass `enabled={previewImage === null}` to `useGridPrefetch`. When preview is open (`previewImage` is set), grid prefetch pauses. It resumes when preview closes.
- Session view is rendered by App.tsx instead of the grid, so ImageGrid unmounts entirely — cleanup handles that case.

**No other changes** to ImageGrid — thumbnail loading, preview modal, selection all unchanged.

### 3. Thumbnail Generation — Folder-Scoped

**Current behavior:** `App.tsx` calls `generateThumbnailsInBackground(referenceFolders)` at startup, generating thumbnails for every folder in the library.

**New behavior:**
- Remove the startup `generateThumbnailsInBackground` call.
- Add a new `useEffect` in `App.tsx` that watches `selectedPath`. When it changes, call `generateThumbnailsInBackground([selectedPath])`. This is per-subfolder — if the user selects a leaf subfolder, only that subfolder's images get thumbnails generated. This is intentional on-demand behavior.
- Edge case: when `selectedPath` is a virtual collection (e.g., `__favorites__`), skip the generation call — favorites reference images from already-opened folders whose thumbnails were generated on first visit.
- **Listener lifecycle:** The `onThumbnailGenerated` and `onThumbnailProgress` IPC listener setup stays in a separate `useEffect` (keyed on mount/unmount only), decoupled from the generation trigger. This avoids teardown/re-setup gaps when switching folders that could cause missed events.
- `thumbnailCacheRef` still accumulates entries across folders within the session. Switching back to a previously opened folder won't re-generate — the main process checks if thumbnail files already exist on disk and skips them.

### 4. Thumbnail Placeholder CSS Fix — Not Needed

With grid preloading, the full-res image is typically already in the browser's decode cache when preview/session opens. The existing `isLoaded()` check in `useImagePrefetch` returns true immediately (browser cache hit), so the thumbnail placeholder never renders. The known sizing bug (200x200 thumbnail not scaling up to fill the view) becomes irrelevant — no CSS changes needed.

### 5. Browser Cache as Shared Layer

Both `useGridPrefetch` (grid view) and `useImagePrefetch` (preview/session navigation) use `new Image()` with `file://` URLs. The browser's decode cache is the shared layer:
- Grid prefetch warms the cache for visible thumbnails' full-res counterparts.
- When preview/session opens, `useImagePrefetch` creates its own `Image` objects — but the browser serves them from its existing decode cache, making loads instant.
- No explicit shared state, events, or coordination between the two hooks.
- Disk I/O contention is avoided by pausing grid prefetch when preview/session is active (see `enabled` parameter in Section 1).

### 6. What Stays Unchanged

- `useImagePrefetch` — sliding window for preview/session navigation, untouched.
- Thumbnail placeholder pattern in ImagePreview and SessionView — stays as cold-cache fallback, untouched.
- Session flow, history, all other features — untouched.

## CSS Changes

Add to `src/styles/main.css`:
- `.grid-preload-spinner` — small CSS-only spinner, positioned absolute bottom-left of thumbnail card. Uses the existing indigo accent color (`#6366f1`).

## Files to Create

- `src/hooks/useGridPrefetch.ts`

## Files to Modify

- `src/components/ImageGrid.tsx` — call `useGridPrefetch`, wire `onCellsRendered` visibility data, hover handlers, spinner rendering, `enabled` flag
- `src/App.tsx` — remove startup thumbnail generation, add folder-scoped generation trigger
- `src/styles/main.css` — spinner styles
