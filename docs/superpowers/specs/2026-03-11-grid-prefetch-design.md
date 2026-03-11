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
  thumbnailCacheRef: React.MutableRefObject<Record<string, string>>
): {
  onVisibleRangeChange: (startIndex: number, endIndex: number) => void;
  prioritize: (path: string) => void;
  isPreloading: (path: string) => boolean;
  isPreloaded: (path: string) => boolean;
}
```

**Queue management:**
- Maintains an ordered queue of image paths to preload, populated from the visible range in grid order.
- `prioritize(path)` bumps an image to position 0 in the queue (used on hover). No-op if already loaded or in-flight.

**Concurrency pool:**
- Up to 3 concurrent `new Image()` loads via `src = file://${path}`.
- On each completion (load or error), pulls the next path from the queue.
- Tracks state per path: idle, loading (in-flight), or loaded.
- `isPreloading(path)` returns true for in-flight images.
- `isPreloaded(path)` returns true for successfully loaded images.

**Thumbnails-first gate:**
- Before starting any full-res loads, checks that every image in the current visible range has an entry in `thumbnailCacheRef.current`.
- If any visible image lacks a thumbnail, the hook idles. Re-checks on each queue processing cycle.
- This prevents full-res decode work from competing with thumbnail loading for disk I/O.

**Scroll handling (debounced):**
- `onVisibleRangeChange` is debounced internally (~150ms) to avoid queue churn during fast scrolling.
- When the debounced visible range updates:
  - Remove any queued (not yet in-flight) images that left the visible area.
  - Do not abort the 3 in-flight loads — they're nearly done and aborting wastes the work already spent.
  - Queue newly visible images in grid order.

**Folder switch:**
- When the `images` array reference changes (user opens a different folder), abort all in-flight loads (`src = ''`), clear the queue, and clear the loaded/loading sets. Start fresh.

**Cleanup:**
- On unmount, set `src = ''` on all in-flight `Image` objects before dereferencing.

### 2. ImageGrid Integration

**File:** `src/components/ImageGrid.tsx`

**Visibility tracking:**
- react-window's `FixedSizeGrid` provides an `onItemsRendered` callback with `visibleRowStartIndex`, `visibleRowStopIndex`, `visibleColumnStartIndex`, `visibleColumnStopIndex`.
- Compute image index range: `startIndex = visibleRowStartIndex * columnsPerRow + visibleColumnStartIndex`, `endIndex = visibleRowStopIndex * columnsPerRow + visibleColumnStopIndex`.
- Pass to `onVisibleRangeChange`.

**Hover priority:**
- Add `onMouseEnter` on each thumbnail cell, calling `prioritize(imagePath)`.

**Loading spinner:**
- In the thumbnail cell render, check `isPreloading(imagePath)`.
- If true, render a small CSS-only spinner element positioned absolute in the bottom-left corner of the thumbnail card.
- Spinner disappears when `isPreloaded(imagePath)` returns true (no replacement indicator).

**No other changes** to ImageGrid — thumbnail loading, preview modal, selection all unchanged.

### 3. Thumbnail Generation — Folder-Scoped

**Current behavior:** `App.tsx` calls `generateThumbnailsInBackground(referenceFolders)` at startup, generating thumbnails for every folder in the library.

**New behavior:**
- Remove the startup `generateThumbnailsInBackground` call.
- Trigger thumbnail generation when the selected folder changes — when `currentImages` is populated, call `generateThumbnailsInBackground` for just that folder's paths.
- `thumbnailCacheRef` still accumulates entries across folders within the session. Switching back to a previously opened folder uses cached entries and doesn't re-generate.

### 4. Thumbnail Placeholder CSS Fix — Not Needed

With grid preloading, the full-res image is typically already in the browser's decode cache when preview/session opens. The existing `isLoaded()` check in `useImagePrefetch` returns true immediately (browser cache hit), so the thumbnail placeholder never renders. The known sizing bug (200x200 thumbnail not scaling up to fill the view) becomes irrelevant — no CSS changes needed.

### 5. Browser Cache as Shared Layer

Both `useGridPrefetch` (grid view) and `useImagePrefetch` (preview/session navigation) use `new Image()` with `file://` URLs. The browser's decode cache is the shared layer:
- Grid prefetch warms the cache for visible thumbnails' full-res counterparts.
- When preview/session opens, `useImagePrefetch` creates its own `Image` objects — but the browser serves them from its existing decode cache, making loads instant.
- No explicit shared state, events, or coordination between the two hooks.

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

- `src/components/ImageGrid.tsx` — call `useGridPrefetch`, wire `onItemsRendered`, hover handlers, spinner rendering
- `src/App.tsx` — remove startup thumbnail generation, add folder-scoped generation trigger
- `src/styles/main.css` — spinner styles
