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
const { isLoaded } = useImagePrefetch(
  currentIndex: number,
  imageList: string[],
  { ahead: 50, behind: 20 }
);
```

**Behavior:**
- On mount and every `currentIndex` change, calculates which image paths fall within the window (50 ahead, 20 behind current index).
- Creates `new Image()` objects with `src = file://${path}` to trigger browser decode and caching.
- Loads in **nearest-first priority order**: index+1, index-1, index+2, index-2, ..., fanning outward. This ensures the most likely next image is prioritized even during a burst of prefetching.
- Loads in small batches or via microtask queue to avoid saturating disk I/O and competing with the current image.
- Tracks loaded state per path in a `Set`.
- `isLoaded(path)` returns whether a given image is decoded and in browser cache.
- Images outside the window are dereferenced, letting the browser evict them from cache naturally.
- No-ops for images already loading or loaded.

**Window sizing rationale:** 50 ahead handles rapid skip-through bursts (user skipping to find an interesting pose). 20 behind covers going back. With 16GB RAM, ~70 full-res images in browser cache is well within budget. Browser can also evict under memory pressure.

### 2. Thumbnail Placeholder Pattern

Used in both `ImagePreview` and `SessionView` to eliminate perceived lag.

**Rendering:**
- Two image layers, stacked:
  1. **Thumbnail layer**: `<img src={file://${thumbnailPath}} />` — scaled up via CSS `object-fit: contain`. Already cached on disk from grid browsing. Appears instantly.
  2. **Full-res layer**: `<img src={file://${fullPath}} />` — positioned on top, starts with `opacity: 0`.
- On full-res `onLoad` event: set `opacity: 1` (instant swap, no transition).
- If `isLoaded(path)` returns true (prefetch already completed): skip the placeholder, show full-res directly. Avoids a flash of blurry image.
- If no thumbnail is cached for the image: show full-res loading directly (no placeholder).

**Visual characteristics:** The 200x200 thumbnail will be visibly blurry at full screen, but provides correct composition and colors so the user recognizes the image immediately. Full-res swap happens within milliseconds if prefetched, or ~1 second if not.

### 3. Integration

#### SessionView (`src/components/SessionView.tsx`)
- Call `useImagePrefetch(currentIndex, queue.map(q => q.imagePath), { ahead: 50, behind: 20 })`.
- Replace bare `<img src={file://${current.imagePath}} />` with the thumbnail placeholder pattern.
- Receive `thumbnailCache: Record<string, string>` as a new prop from `App.tsx`.

#### ImagePreview (`src/components/ImagePreview.tsx`)
- Call `useImagePrefetch(currentIndex, imageList, { ahead: 50, behind: 20 })`.
- Replace bare `<img>` with the thumbnail placeholder pattern.
- Receive new props from parent: `imageList: string[]`, `currentIndex: number`, `thumbnailCache: Record<string, string>`.

#### App.tsx
- Thread `thumbnailCacheRef` to `SessionView` and `ImagePreview` as a prop.
- Pass `currentImages` array and computed `currentIndex` to `ImagePreview`.

#### No changes to:
- Thumbnail generation pipeline
- `ImageGrid` component
- Electron main process or IPC handlers
- `thumbnailQueue.ts`
- Disk caching or electron-store logic

## Files to Create
- `src/hooks/useImagePrefetch.ts`

## Files to Modify
- `src/components/ImagePreview.tsx`
- `src/components/SessionView.tsx`
- `src/App.tsx`
