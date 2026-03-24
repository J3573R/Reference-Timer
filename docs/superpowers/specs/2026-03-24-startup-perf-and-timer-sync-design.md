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

- Use `fs.promises.access()` instead of `fs.existsSync()` for all file existence checks. Note: `fs.promises.access()` throws on missing files rather than returning false — each check needs try/catch
- Process cache entries in batches of 50 entries. Use `Promise.allSettled()` within each batch so the ~150 file checks per batch (parent dir, image, thumbnail) run concurrently against the filesystem
- Yield between batches with `setTimeout(0)` to keep the event loop responsive for IPC
- Keep the same logic: skip entries whose parent directory doesn't exist (unmounted volumes), remove orphaned entries and their thumbnail files
- Convert deletion phase to async as well (`fs.promises.unlink` instead of `fs.unlinkSync`) to avoid reintroducing blocking during cleanup of many orphaned files
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
- **Merge the `fullResLoaded` reset effect and `currentIndex` effect into a single effect** to avoid relying on React effect ordering. The combined effect:
  - Checks if `isLoaded(current.imagePath)` is already true (prefetch decoded it) — if so, sets `fullResLoaded` to `true` and calls `reset(duration)` to start immediately
  - Otherwise, sets `fullResLoaded` to `false` and calls `resetAndStop(duration)` (timer paused until image loads)
- Add a separate effect watching `fullResLoaded`: when it transitions to `true`, call `reset(current.duration)` to start the countdown. Note: `reset` from `useTimer` is referentially stable (empty dep array), so this effect won't spuriously re-fire
- Move `setImageStartTime(Date.now())` into the `fullResLoaded` effect so drawing time tracking is accurate (time starts when the user can actually see the image). **Remove** the `setImageStartTime(Date.now())` calls from `goToNext` and `goToPrevious` — otherwise imageStartTime gets set twice (once on navigation, once on load)
- The `handleResetTimer` (R key) continues to call `resetAndStop` as before — user manually unpauses with Space. No change needed there

### Part 3: Pre-shuffle and Preload from Session Modal

**Files**: `src/App.tsx`, `src/components/SessionView.tsx`

The shuffle order is independent of session config (config only affects count and durations). This means we can shuffle and preload before the user clicks "Start":

- When the session modal opens (`showSessionModal` becomes true), `App.tsx` shuffles `Array.from(selectedImages)` and stores the result in a ref. Assumption: `selectedImages` is stable while the modal is open (users cannot change image selection with the modal overlay active)
- An effect immediately begins preloading the first ~5 images from the shuffled array using `new Image().src = file://...` — this warms the browser's decoded image cache. **The `Image` objects must be kept alive in a ref** until `SessionView` mounts; otherwise GC may evict the decoded images from the browser cache before they're used
- When the user clicks "Start", the pre-shuffled array is passed to `SessionView`
- `buildSessionQueue` in `SessionView` no longer calls `shuffleArray()` internally — it trusts the input order and just slices/maps based on config. The `images` prop contract changes from "unordered set of candidates" to "pre-shuffled ordered array"
- `shuffleArray` moves out of `SessionView.tsx` (into `App.tsx` or a small utility) since `SessionView` no longer needs it
- **Rerun sessions** (`handleRerunSession` in App.tsx): These pass images from session history. They should be re-shuffled at the call site before passing to `SessionView`, since replaying the exact same order is not desired

**Result**: By the time the user finishes configuring and clicks "Start", the first several images are already decoded in the browser cache. Combined with Part 2 (timer waits for load), the session start feels instant.

## Files Changed

| File | Change |
|------|--------|
| `electron/main.ts` | Rewrite `cleanupOrphanedThumbnails` to async batched with `fs.promises.access/unlink` |
| `src/components/SessionView.tsx` | Timer waits for `fullResLoaded`, merge index/load effects, remove `shuffleArray` and shuffle from `buildSessionQueue`, remove `setImageStartTime` from `goToNext`/`goToPrevious` |
| `src/App.tsx` | Pre-shuffle on modal open, preload first ~5 images in a ref, pass shuffled array to SessionView, re-shuffle in `handleRerunSession` |

## Not in Scope

- Moving cleanup to a worker thread (async batching is sufficient)
- Preloading from the modal beyond ~5 images (diminishing returns, memory cost)
- Changes to `useTimer` hook itself (the hook API already supports what we need via `reset`/`resetAndStop`)
- Distinct "loading" visual indicator while timer waits for image (the paused state with thumbnail visible is acceptable for now)
