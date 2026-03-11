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
- **Low generation concurrency** — foreground: 4, background: 2 (Sharp uses libvips which is mixed CPU/IO; modern machines can handle higher concurrency)

## Solution

Five coordinated changes that preserve all existing features.

### 1. Virtualized Grid

Replace the `.map()` rendering with react-window v2's `Grid` component.

**react-window v2 API details:**
- `Grid` auto-sizes to its container via internal `ResizeObserver` — no explicit `height`/`width` props needed
- Cell rendering via `cellComponent` prop (not children render function)
- Additional data passed to cells via `cellProps` prop
- Cell component receives `{ ariaAttributes, columnIndex, rowIndex, style, ...cellProps }`
- `onResize` callback provides container dimensions — use this to derive column count from card width (~160px + gap)
- `overscanCount` prop controls how many extra rows/columns render outside the visible area (set to 2-3)

**What changes:**
- For 1,200 images at 6 columns = ~200 rows, but only ~15-20 rows in the DOM at any time
- `ImageCard` is adapted to work as a `cellComponent` — receives `rowIndex`/`columnIndex`, computes the image index as `rowIndex * columnCount + columnIndex`
- Grid header (Select All, Clear, count) stays outside the virtualized area
- All features preserved: selection checkboxes, favorites, preview on click, select all/clear — these operate on image paths, not DOM position

**CSS considerations:**
- The existing `.image-grid-container` has `overflow-y: auto` which will conflict with `Grid`'s internal scroll management. This must be changed (e.g., `overflow: hidden` on the container, let `Grid` handle scrolling).

### 2. Visibility-Aware Thumbnail Loading

Only request thumbnails for images currently on screen.

- `Grid` provides `onCellsRendered` callback with signature: `(visibleCells, allCells)` where both are `{ columnStartIndex, columnStopIndex, rowStartIndex, rowStopIndex }`
- Derive visible image indices from the range (convert row/column to flat index)
- Only visible uncached images get thumbnail IPC requests
- ~100ms debounce on scroll prevents IPC spam during fast scrolling; the overscan buffer (2-3 rows) is the primary mitigation for perceived latency during the debounce window
- Remove the current eager batch-loading `useEffect` (ImageGrid.tsx lines 105-141)

**Placeholder rendering:**
- Images without a cached thumbnail show a lightweight CSS placeholder (gray box, subtle shimmer) instead of falling back to the full original
- The `thumbnailCache[imagePath] || imagePath` fallback is removed entirely

**Folder switching:**
- Switching folders cancels in-flight requests for the old folder
- New folder renders instantly as a grid of placeholders, fills in as thumbnails resolve

**Favorites view:**
- The favorites view (`selectedPath === '__favorites__'`) spans images from multiple folders. No special handling needed — the same visibility-aware loading and thumbnail cache (keyed by full image path) works identically.

### 3. Persistent Thumbnail Path Cache

Persist the `imagePath -> thumbnailPath` mapping in `electron-store`.

**Store schema:**
- New field in `AppData` (in `shared/types.ts`): `thumbnailCache: Record<string, string>`
- Key name in electron-store: `thumbnailCache`
- Loaded on app start in the initial `Promise.all` alongside other persisted state

**Cache behavior:**
- Images with cached paths render their thumbnail immediately — no IPC call, no placeholder flicker
- Debounced writes: batch persist cache updates (e.g., every 2 seconds or on batch completion), not on every single thumbnail resolution
- Background generation (`generateThumbnailsInBackground`) feeds resolved paths into the persisted cache, so thumbnails generated in the background are available when the user navigates to that folder later

**Cache invalidation:**
- If a persisted path points to a nonexistent file, treat as cache miss and re-request (single `existsSync` — cheaper than current 2x `statSync` per image)
- Trade-off: if a source image is replaced with a different image at the same path, the stale thumbnail will persist until the thumbnail file is deleted or the cache is cleared. This is acceptable for reference image packs which are static by nature. A manual "regenerate thumbnails" option in settings could address edge cases.

**Size management:**
- For 10,000 images, the cache is ~10,000 entries of ~150 chars each ≈ 1.5MB JSON. This is within electron-store's comfortable range.

### 4. Generation Pipeline Improvements

Faster first-run generation with visibility-aware prioritization.

**Priority queue:**
- Single `ThumbnailQueue` class in the main process with priority levels (high = visible, low = background)
- Visible image requests jump to the front of the queue
- Deduplicates requests (if background and foreground both want the same image, process once)
- Open folder with 1,200 new images -> ~30 visible ones appear in 1-2 seconds, rest generate in background

**Higher concurrency:**
- Foreground (visible): 4 -> 6 concurrent
- Background: 2 -> 4 concurrent
- Sharp uses libvips internally which is mixed CPU/IO (file read is IO, resize+encode is CPU). These conservative increases should work well on typical hardware without saturating CPU; can be tuned based on benchmarking.
- Background yields to foreground — visible images take priority when user scrolls during background generation

**Implementation:**
- `getThumbnails` and `generateThumbnailsInBackground` both feed into `ThumbnailQueue` instead of managing their own batch loops
- No worker thread needed — Sharp/libvips does its heavy lifting off the Node.js main thread internally

### 5. Memoization and Re-render Fixes

**`onThumbnailsLoaded` callback:**
- Wrap in `useCallback` in App.tsx so ImageGrid's effects don't re-trigger on every parent render

**`thumbnailCache` — use `useRef` + stable updater:**
- The current approach stores the cache in React state, meaning every batch update triggers a re-render cascade. Even after memoizing `onThumbnailsLoaded`, the `thumbnailCache` state dependency in the loading effect causes re-evaluation after each batch.
- Solution: store the cache in a `useRef` for reads (no re-renders on update). Use a separate minimal state counter or targeted state update to trigger re-renders only for the visible cells that actually received new thumbnails. The `cellProps` mechanism of react-window v2's `Grid` handles this efficiently — updating `cellProps` triggers re-renders only for affected cells.

**ImageGrid dependency array:**
- New visibility-aware effect depends on `[visibleRange]` — the effect reads from the ref-based cache without it being a dependency, making it much more stable than the current `[images, thumbnailCache, onThumbnailsLoaded]`

## Files Changed

| File | Changes |
|------|---------|
| `src/components/ImageGrid.tsx` | Virtualized `Grid`, visibility-aware loading, placeholder rendering, remove eager batch loading |
| `src/App.tsx` | Persist thumbnailCache to electron-store, memoize `onThumbnailsLoaded`, load cache on startup, `useRef` for cache |
| `electron/fileSystem.ts` | `ThumbnailQueue` class, higher concurrency, priority support, feed persisted cache from background generation |
| `electron/main.ts` | Wire up cache persistence IPC, connect queue to existing handlers |
| `electron/preload.ts` | Expose any new IPC methods for cache persistence |
| `src/electron.d.ts` | Type definitions for new IPC methods |
| `shared/types.ts` | Add `thumbnailCache: Record<string, string>` to `AppData` |
| `src/styles/main.css` | Placeholder shimmer animation, adjust `.image-grid-container` overflow for virtualized grid |

## Preserved Features

All existing features remain unchanged:

- Image selection (checkboxes, select all, clear)
- Favorites (star button, favorites folder view)
- Image preview modal with navigation
- Session configuration and timer
- Session history
- Folder tree navigation with on-demand subfolder loading
- Background thumbnail generation with progress indicator in TopBar
- Settings modal with folder management
