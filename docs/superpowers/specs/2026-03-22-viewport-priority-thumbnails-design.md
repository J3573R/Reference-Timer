# Viewport-Priority Thumbnail Generation

**Date:** 2026-03-22
**Status:** Draft

## Problem

When importing a large image folder (40GB+), the app floods the thumbnail queue with thousands of background generation jobs. Visible grid thumbnails compete with this background work for the 6 concurrent Sharp slots, resulting in:

- Empty cells with no visible progress when first opening a folder
- Thumbnails appearing in random order rather than filling in from the top of the viewport
- The experience feels broken even though the system is working — just on the wrong images

## Design Goals

1. Visible thumbnails appear immediately in viewport order (top-to-bottom, left-to-right)
2. Full-res hover prefetch and session prefetch are not slowed by background thumbnail work
3. Background thumbnail generation still completes all images over time for cache warming
4. Minimal changes to existing systems — no new worker threads, no Sharp changes

## Priority Hierarchy

| Priority | What | When |
|----------|------|------|
| 1 (highest) | Visible grid thumbnails | User is browsing the grid |
| 2 | Hover full-res prefetch | Mouse enters a grid cell |
| 3 | Full-res image being viewed | User clicked (fallback if hover didn't finish) |
| 4 | Adjacent prefetch (next/prev) | In session or preview mode |
| 5 (lowest) | Background thumbnail generation | Idle — nothing above is active |

Background thumbnail generation yields to all other work.

## Design

### 1. ThumbnailQueue Overhaul

**File:** `electron/thumbnailQueue.ts`

Add pause/resume and foreground/background mode switching:

- **`pause()`** — stops dequeueing background items. In-flight jobs finish naturally (Sharp operations are short, cancelling mid-resize gains nothing).
- **`resume()`** — resumes background dequeueing.
- **Foreground mode** — activated when viewport thumbnail requests arrive. Pauses background queue. All available concurrency slots serve viewport requests.
- **Background mode** — activated after all viewport requests complete and a 500ms quiet period passes. Background queue resumes.
- When entering foreground mode, **clear queued (not in-flight) background items** so they don't occupy slots after viewport work finishes. The lazy batch feeder (Section 3) will re-enqueue them.

Sharp operations are a fraction of a second per thumbnail. Letting up to 6 in-flight jobs drain before serving viewport requests is acceptable — no cancellation needed.

### 2. Viewport-Ordered Thumbnail Loading

**File:** `src/components/ImageGrid.tsx`

Changes to `loadVisibleThumbnails()`:

- **Order uncached images top-to-bottom, left-to-right** before sending to main process via `fs:getThumbnails`. The queue processes items in received order, so visual ordering means thumbnails fill in row by row.
- **Signal foreground mode** when sending visible thumbnail requests. This pauses background work immediately.
- Existing behavior preserved: 100ms scroll debounce, 2-row overscan extension, `loadingRef` concurrency guard, recursive re-check after batch completes.

On scroll to a new area:
- Debounce fires after 100ms of quiet
- New viewport request arrives, triggers foreground mode
- Queued-but-not-in-flight background items are cleared
- New visible set is processed in visual order
- After completion + 500ms quiet, background resumes

### 3. Background Generation: Lazy Batch Enqueueing

**File:** `electron/main.ts` (IPC handler for `fs:generateThumbnailsInBackground`)

Replace flood-the-queue approach with lazy batching:

- **Batch size:** 50 images at a time
- **Folder-order processing:** Images are enqueued in the same sort order as the grid UI. This means the top of the grid gets warm first — scrolling down after waiting reveals pre-generated thumbnails in order.
- **Batch chaining:** When a batch completes, the next 50 are enqueued. A simple index tracks position in the image list.
- **Pause-aware:** When the queue switches to foreground mode, the batch feeder stops enqueueing. When background mode resumes, it picks up where it left off.
- **Total count known upfront:** The folder scan still runs to determine total image count. Only enqueueing is lazy.
- **Progress reporting unchanged:** `thumbnail-progress` and `thumbnail-generated` IPC events still fire. TopBar badge still works.

### 4. Cross-System I/O Coordination

Full-res loading (renderer, `new Image()`) and thumbnail generation (main process, Sharp) are separate systems that compete for disk I/O. Coordination via pause/resume signals:

**New IPC channels:**
- `fs:pauseBackgroundThumbnails` — pauses background thumbnail generation
- `fs:resumeBackgroundThumbnails` — resumes background thumbnail generation (with reference counting or debounce to handle overlapping pause sources)

**`useHoverPrefetch.ts`:**
- Call `pauseBackgroundThumbnails` when hover load starts
- Call `resumeBackgroundThumbnails` when hover load completes or is cancelled (mouse leave)

**`useImagePrefetch.ts`:**
- Call `pauseBackgroundThumbnails` on mount (entering session/preview)
- Call `resumeBackgroundThumbnails` on unmount (returning to grid)

**`preload.ts`:**
- Expose the two new IPC methods on `window.electronAPI.fs`

**What we are NOT doing:**
- No unified cross-process queue. Renderer image loading and Sharp generation are fundamentally different systems.
- No pausing hover prefetch for viewport thumbnails. Hover only fires when a thumbnail is already visible — it's complementary, not competing.
- No changes to `useHoverPrefetch` or `useImagePrefetch` internal logic.

## Files Changed

| File | Change |
|------|--------|
| `electron/thumbnailQueue.ts` | Add pause/resume, foreground/background mode, clear-on-foreground |
| `electron/main.ts` | Lazy batch enqueueing, foreground mode trigger in `fs:getThumbnails`, new pause/resume IPC handlers |
| `electron/preload.ts` | Expose `pauseBackgroundThumbnails` / `resumeBackgroundThumbnails` |
| `src/components/ImageGrid.tsx` | Order uncached images in visual order, signal foreground mode |
| `src/hooks/useHoverPrefetch.ts` | Pause/resume background on hover start/end |
| `src/hooks/useImagePrefetch.ts` | Pause/resume background on mount/unmount |

## What Stays Unchanged

- Sharp thumbnail generation (200x200, JPEG quality 80, cover crop)
- Thumbnail file caching (`~/Library/Application Support/reference-timer/thumbnails/`)
- Thumbnail cache persistence (electron-store, debounced writes)
- Grid virtualization (react-window, overscan, cell memoization)
- Session prefetch sliding window (50 ahead, 20 behind)
- Hover prefetch internal logic (single in-flight, thumbnail-gated)
- Progress reporting (TopBar badge)
