# Image Loading Snappiness Design

## Problem

Opening image preview and advancing through images in session mode has noticeable lag. Full-resolution reference images (often 8-20+ MP professional photographs) are loaded on-demand via `file://` URLs with no preloading or placeholder. The user perceives a delay between clicking and seeing the image.

Thumbnail browsing in the grid is already optimized and must not regress.

## Solution

Two complementary techniques:

1. **Prefetch sliding window** — preload images around the current position so they're already decoded when needed
2. **Thumbnail placeholder** — show the cached 200x200 thumbnail (scaled up, blurry) instantly while full-res loads, swap when ready

## Design

### 1. `useImagePrefetch` Hook

A shared React hook that manages a sliding window of preloaded images.

**Interface:**
```typescript
function useImagePrefetch(
  currentIndex: number,
  imageList: string[],
  options: { ahead: number; behind: number }
): { isLoaded: (path: string) => boolean }

// Usage:
const { isLoaded } = useImagePrefetch(currentIndex, imageList, { ahead: 50, behind: 20 });
```

**Behavior:**
- On mount and every `currentIndex` change, calculates which image paths fall within the window (50 ahead, 20 behind current index).
- Creates `new Image()` objects with `src = file://${path}` to trigger browser decode and caching.
- Loads in **nearest-first priority order**: index+1, index-1, index+2, index-2, ..., fanning outward. This ensures the most likely next image is prioritized even during a burst of prefetching.
- Loads in small batches or via microtask queue to avoid saturating disk I/O and competing with the current image.
- Tracks loaded state per path in a `Set`.
- `isLoaded(path)` returns whether a given image is decoded and in browser cache.
- **Memory cleanup:** Images outside the window have their `src` set to `''` before the `Image` object is dereferenced. This is best practice to help Chromium release decoded bitmaps sooner, though the browser will also evict under memory pressure regardless.
- No-ops for images already loading or loaded.

**Window sizing rationale:** 50 ahead handles rapid skip-through bursts (user skipping to find an interesting pose). 20 behind covers going back. ~70 full-res images in browser cache is reasonable; Chromium's image decode cache evicts under memory pressure, so this is safe even on lower-RAM machines.

### 2. Thumbnail Placeholder Pattern

Used in both `ImagePreview` and `SessionView` to eliminate perceived lag.

**Rendering:**
- Two image layers, stacked via CSS (`position: relative` container, `position: absolute` layers):
  1. **Thumbnail layer**: `<img src={file://${thumbnailPath}} />` — scaled up via CSS `object-fit: contain`. Already cached on disk from grid browsing. Appears instantly.
  2. **Full-res layer**: `<img src={file://${fullPath}} />` — positioned on top via absolute positioning, starts with `opacity: 0`.
- On full-res `onLoad` event: set `opacity: 1` (instant swap, no transition).
- If `isLoaded(path)` returns true (prefetch already completed): skip the placeholder, show full-res directly. Avoids a flash of blurry image.
- If no thumbnail is cached for the image: show full-res loading directly (no placeholder).

**Visual characteristics:** The 200x200 thumbnail will be visibly blurry at full screen, but provides correct composition and colors so the user recognizes the image immediately. Full-res swap happens within milliseconds if prefetched, or ~1 second if not.

### 3. Integration

#### SessionView (`src/components/SessionView.tsx`)
- Call `useImagePrefetch(currentIndex, queue.map(q => q.imagePath), { ahead: 50, behind: 20 })`. Note: `queue` is local `useState` inside SessionView containing `{ imagePath, duration, stageName? }` items — the `.map()` extracts the paths.
- Replace bare `<img src={file://${current.imagePath}} />` with the thumbnail placeholder pattern.
- Receive `thumbnailCacheRef` as a new prop from `App.tsx`, typed as `React.MutableRefObject<Record<string, string>>` (consistent with how `ImageGrid` already receives it). Thumbnail lookup: `thumbnailCacheRef.current[imagePath]` — same pattern as `ImageGrid`. If lookup returns undefined (background generation hasn't cached it yet), skip the placeholder.

#### ImagePreview (`src/components/ImagePreview.tsx`)
- Call `useImagePrefetch(currentIndex, imageList, { ahead: 50, behind: 20 })` internally using the new props.
- Replace bare `<img>` with the thumbnail placeholder pattern.
- Receive new props: `imageList: string[]`, `currentIndex: number`, `thumbnailCacheRef: React.MutableRefObject<Record<string, string>>`.
- **Zoom/pan interaction:** Both thumbnail and full-res layers must receive the same `transform: scale() translate()` values so zoom/pan works during loading. Once full-res `onLoad` fires, remove the thumbnail layer from the DOM entirely (not just hide with opacity) to avoid rendering two transformed images. The `stopPropagation` on click (preventing overlay close) must also be on the thumbnail layer while it's visible.

#### ImageGrid (`src/components/ImageGrid.tsx`)
- `ImageGrid` is the parent that renders `ImagePreview`. It already manages `previewImage`, `currentPreviewIndex`, and navigation handlers (`handlePrevImage`, `handleNextImage`).
- Thread the new props through: pass `images` (already available), `currentPreviewIndex` (already computed), and `thumbnailCache` (already received as prop) down to `ImagePreview`.
- No changes to navigation logic — `ImageGrid` continues to own that.

#### App.tsx
- Thread `thumbnailCacheRef` to `SessionView` as a prop (it already passes it to `ImageGrid`).

#### No changes to:
- Thumbnail generation pipeline
- Electron main process or IPC handlers
- Disk caching or electron-store logic

## CSS Changes

Add styles to `src/styles/main.css` for the thumbnail placeholder stacking:
- Container: `position: relative` with full dimensions
- Thumbnail layer: `position: absolute`, `inset: 0`, `object-fit: contain`
- Full-res layer: `position: absolute`, `inset: 0`, `object-fit: contain`, `opacity` toggled on load

## Files to Create
- `src/hooks/useImagePrefetch.ts`

## Files to Modify
- `src/components/ImagePreview.tsx`
- `src/components/ImageGrid.tsx` (thread new props to ImagePreview)
- `src/components/SessionView.tsx`
- `src/App.tsx`
- `src/styles/main.css`
