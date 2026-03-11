# Thumbnail Performance Design

## Problem

Thumbnail loading is slow and causes UI sluggishness across three scenarios:

1. **App startup** — 10+ second wait before images appear, even when thumbnails exist on disk
2. **Scrolling** — jank while thumbnails are still loading
3. **Folder switching** — app freezes if switching folders before the previous folder finishes loading

### Root Causes

- **No virtualization** — `ImageGrid` renders all 300-1,200 images via `.map()`, creating that many DOM nodes regardless of visibility
- **Fallback to full originals** — when `thumbnailCache[imagePath]` is empty, the grid loads the multi-MB original image: `thumbnailPath={thumbnailCache[imagePath] || imagePath}`
- **Ephemeral in-memory cache** — `thumbnailCache` is React state initialized to `{}` on every app launch; never persisted to disk
- **Eager batch loading** — all thumbnails are requested sequentially in batches of 20, including off-screen images
- **Background generation doesn't feed the cache** — `generateThumbnailsInBackground` writes thumbnails to disk but never tells the renderer about the resolved paths
- **Expensive cache hits** — even when thumbnails exist on disk, each `getThumbnail` call performs: MD5 hash + `existsSync` + 2x `statSync` + mtime comparison (2,400+ stat calls for 1,200 images)
- **Unmemoized callback** — `onThumbnailsLoaded` is an inline function in App.tsx JSX, causing ImageGrid's batch-loading `useEffect` to re-evaluate on every render
- **Low generation concurrency** — foreground: 4, background: 2 (Sharp is I/O-bound and can handle more)

## Solution

Five coordinated changes that preserve all existing features.

### 1. Virtualized Grid

Replace the `.map()` rendering with `react-window`'s `FixedSizeGrid`.

- Grid container measures its own width via a ref/`ResizeObserver`
- Calculates column count based on card width (~160px + gap)
- `FixedSizeGrid` renders only visible rows + 2-3 rows overscan
- For 1,200 images at 6 columns = ~200 rows, but only ~15-20 rows in the DOM at any time
- `ImageCard` component stays as-is (already memoized with `memo()`)
- Grid header (Select All, Clear, count) stays outside the virtualized area
- All features preserved: selection checkboxes, favorites, preview on click, select all/clear — these operate on image paths, not DOM position

### 2. Visibility-Aware Thumbnail Loading

Only request thumbnails for images currently on screen.

- `FixedSizeGrid` provides `onItemsRendered` callback reporting visible row/column ranges
- Derive visible image indices from the range + overscan buffer of ~2 rows
- Only visible uncached images get thumbnail IPC requests
- ~100ms debounce on scroll prevents IPC spam during fast scrolling
- Remove the current eager batch-loading `useEffect` (ImageGrid.tsx lines 105-141)

**Placeholder rendering:**
- Images without a cached thumbnail show a lightweight CSS placeholder (gray box, subtle shimmer) instead of falling back to the full original
- The `thumbnailCache[imagePath] || imagePath` fallback is removed entirely

**Folder switching:**
- Switching folders cancels in-flight requests for the old folder
- New folder renders instantly as a grid of placeholders, fills in as thumbnails resolve

### 3. Persistent Thumbnail Path Cache

Persist the `imagePath -> thumbnailPath` mapping in `electron-store`.

- Load cache from `electron-store` on app start in the initial `Promise.all` (App.tsx line 34)
- Images with cached paths render their thumbnail immediately — no IPC call, no placeholder flicker
- Cache invalidation: if a persisted path points to a nonexistent file, treat as cache miss (single `existsSync` — cheaper than current 2x `statSync` per image)
- Debounced writes: batch persist cache updates, not on every single thumbnail resolution
- Background generation (`generateThumbnailsInBackground`) feeds resolved paths into the persisted cache, so thumbnails generated in the background are available when the user navigates to that folder later

### 4. Generation Pipeline Improvements

Faster first-run generation with visibility-aware prioritization.

**Priority queue:**
- Single `ThumbnailQueue` class in the main process with priority levels (high = visible, low = background)
- Visible image requests jump to the front of the queue
- Deduplicates requests (if background and foreground both want the same image, process once)
- Open folder with 1,200 new images -> ~30 visible ones appear in 1-2 seconds, rest generate in background

**Higher concurrency:**
- Foreground (visible): 4 -> 8 concurrent (Sharp is I/O-bound)
- Background: 2 -> 6 concurrent
- Background yields to foreground — visible images take priority when user scrolls during background generation

**Implementation:**
- `getThumbnails` and `generateThumbnailsInBackground` both feed into `ThumbnailQueue` instead of managing their own batch loops
- No worker thread needed — Sharp does its heavy lifting off the Node.js main thread internally

### 5. Memoization and Re-render Fixes

**`onThumbnailsLoaded` callback:**
- Wrap in `useCallback` in App.tsx so ImageGrid's effects don't re-trigger on every parent render

**`thumbnailCache` state updates:**
- With virtualization, fewer batches fire (only visible images requested), reducing state churn naturally
- Consider `useRef` for the cache with a stable update function if state-based re-renders are still problematic

**ImageGrid dependency array:**
- New visibility-aware effect depends on `[visibleRange, thumbnailCache]` — much more stable than the current `[images, thumbnailCache, onThumbnailsLoaded]`

## Files Changed

| File | Changes |
|------|---------|
| `src/components/ImageGrid.tsx` | Virtualized grid, visibility-aware loading, placeholder rendering, remove eager batch loading |
| `src/App.tsx` | Persist thumbnailCache to electron-store, memoize onThumbnailsLoaded, load cache on startup |
| `electron/fileSystem.ts` | ThumbnailQueue class, higher concurrency, priority support, feed persisted cache from background generation |
| `electron/main.ts` | Wire up cache persistence IPC, connect queue to existing handlers |
| `electron/preload.ts` | Expose any new IPC methods for cache persistence |
| `src/electron.d.ts` | Type definitions for new IPC methods |
| `src/styles/main.css` | Placeholder shimmer animation styles |

## Preserved Features

All existing features remain unchanged:

- Image selection (checkboxes, select all, clear)
- Favorites (star button, favorites folder view)
- Image preview modal with navigation
- Session configuration and timer
- Session history
- Folder tree navigation with lazy-loaded subfolders
- Background thumbnail generation with progress indicator in TopBar
- Settings modal with folder management
