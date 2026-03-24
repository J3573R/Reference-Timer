# Startup Performance & Timer-Image Sync

**Date**: 2026-03-24
**Status**: Draft

## Problem

Two user-facing issues:

1. **Slow app startup**: The `cleanupOrphanedThumbnails()` function runs synchronous `fs.existsSync()` calls for every entry in the thumbnail cache (10-30k entries = 20-90k synchronous syscalls). This blocks the main Electron process event loop, stalling all IPC requests from the renderer (store reads, thumbnail fetches).

2. **Timer starts before image loads**: In `SessionView`, the countdown timer starts immediately when the image index changes via `reset(duration)`. The timer has no awareness of whether the full-resolution image has finished loading. Users see a thumbnail or blank space while their drawing time is already ticking.

3. **Cold-start delay on session begin**: The first session image only starts loading when `SessionView` mounts. No preloading happens while the user is configuring session options in the modal.

## Design

### Part 1: Async Batched Thumbnail Cleanup

**File**: `electron/main.ts` — `cleanupOrphanedThumbnails()`

Replace the synchronous loop with an async batched approach:

- Use `fs.promises.access()` instead of `fs.existsSync()` for all file existence checks
- Process cache entries in batches of 50
- Yield between batches with `setTimeout(0)` to keep the event loop responsive for IPC
- Keep the same logic: skip entries whose parent directory doesn't exist (unmounted volumes), remove orphaned entries and their thumbnail files
- Still fires on `did-finish-load`, still logs results — just non-blocking

### Part 2: Timer Waits for Full Image Load

**File**: `src/components/SessionView.tsx`

Current flow:
```
currentIndex changes → reset(duration) → timer starts immediately
```

New flow:
```
currentIndex changes → resetAndStop(duration) → timer paused
fullResLoaded becomes true → reset(duration) → timer starts
```

Changes:
- In the `currentIndex` effect (line 147-151), call `resetAndStop(duration)` instead of `reset(duration)` — sets the time but keeps timer paused
- Add a new effect watching `fullResLoaded`: when it becomes `true`, call `reset(current.duration)` to start the countdown
- Move `setImageStartTime(Date.now())` into the `fullResLoaded` effect so drawing time tracking is accurate (time starts when the user can actually see the image)
- On `currentIndex` change, if `isLoaded(current.imagePath)` is already true (prefetch already decoded it), set `fullResLoaded` to `true` immediately — skips the fade and starts the timer without waiting for a redundant `onLoad`

### Part 3: Pre-shuffle and Preload from Session Modal

**Files**: `src/App.tsx`, `src/components/SessionView.tsx`

The shuffle order is independent of session config (config only affects count and durations). This means we can shuffle and preload before the user clicks "Start":

- When the session modal opens (`showSessionModal` becomes true), `App.tsx` shuffles `selectedImages` and stores the result in a ref
- An effect immediately begins preloading the first ~5 images from the shuffled array using `new Image().src = file://...` — this warms the browser's decoded image cache
- When the user clicks "Start", the pre-shuffled array is passed to `SessionView`
- `buildSessionQueue` in `SessionView` no longer calls `shuffleArray()` internally — it trusts the input order and just slices/maps based on config
- `shuffleArray` moves out of `SessionView.tsx` (into `App.tsx` or a small utility) since `SessionView` no longer needs it

**Result**: By the time the user finishes configuring and clicks "Start", the first several images are already decoded in the browser cache. Combined with Part 2 (timer waits for load), the session start feels instant.

## Files Changed

| File | Change |
|------|--------|
| `electron/main.ts` | Rewrite `cleanupOrphanedThumbnails` to async batched |
| `src/components/SessionView.tsx` | Timer waits for `fullResLoaded`, remove `shuffleArray` and internal shuffle from `buildSessionQueue` |
| `src/App.tsx` | Pre-shuffle on modal open, preload first ~5 images, pass shuffled array to SessionView |

## Not in Scope

- Moving cleanup to a worker thread (async batching is sufficient)
- Preloading from the modal beyond ~5 images (diminishing returns, memory cost)
- Changes to `useTimer` hook itself (the hook API already supports what we need via `reset`/`resetAndStop`)
