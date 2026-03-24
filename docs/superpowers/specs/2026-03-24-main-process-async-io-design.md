# Main Process Async I/O Fixes

## Problem

At 10k–100k images, synchronous file system calls in the Electron main process block the event loop for 4–17+ seconds during folder selection and cause I/O contention at startup. During this time, all IPC is stalled — the renderer is effectively frozen.

Two user-visible symptoms:
1. **Startup stutter** — cache cleanup runs eagerly on `did-finish-load`, issuing up to 200k I/O ops
2. **Scroll-to-visible delay** — after selecting a large folder, thumbnails take 1–2 seconds to start appearing because the main process is blocked by synchronous `needsThumbnail` filtering and `getAllImagesRecursive` scanning

## Root Cause

Three synchronous code paths in `electron/fileSystem.ts` block the main process event loop:

1. `needsThumbnail()` — 2–4 sync `fs.*Sync` calls per image, called via `Array.filter()` over all images
2. `getAllImagesRecursive()` — recursive `fs.readdirSync` through entire folder tree
3. `getThumbnail()` — sync `fs.existsSync` + `fs.statSync` for cache validation (concurrency-limited to 6, so lower impact)

Plus one scheduling issue:
- `cleanupOrphanedThumbnails()` fires immediately at startup, creating I/O contention during the critical first-render window

And one amplifier:
- `getThumbnailsDir()` runs `fs.existsSync` on every call, adding 100k redundant syscalls

## Estimated Impact at Scale

| Fix | Blocking at 100k | Effort |
|-----|-------------------|--------|
| #2: `needsThumbnail` async | 4–15s → 0 | ~35 lines |
| #1: Defer cleanup | 5–15s contention → 0 | 1 line |
| #3: `getAllImagesRecursive` async | 0.5–2s → 0 | ~25 lines |
| #5: Cache thumbnails dir | amplifies #2 by ~25% | 3 lines |
| #4: `getThumbnail` async | <1ms (best practice) | ~10 lines |
| #7: Reduce debounce | 50ms perceived | 1 line |

## Design

### Files Changed

- `electron/fileSystem.ts` — Fixes #5, #4, #3, #2
- `electron/main.ts` — Fix #1, caller updates for #2/#3
- `src/components/ImageGrid.tsx` — Fix #7

### Fix #5: Cache `getThumbnailsDir()`

Add module-level `let cachedDir: string | null = null`. First call does `existsSync` + `mkdirSync` and caches. Subsequent calls return immediately.

### Fix #4: `getThumbnail()` sync fs → async

Replace the cache-check block:
- `fs.existsSync(thumbnailPath)` → removed (handled by stat catch)
- `fs.statSync(thumbnail)` + `fs.statSync(original)` → `Promise.all([fs.promises.stat(...), fs.promises.stat(...)])`

Function already returns `Promise<string>` — no signature change.

### Fix #3: `getAllImagesRecursive()` sync → async

- Change return type: `string[]` → `Promise<string[]>`
- `fs.existsSync` → `fs.promises.access` in try/catch
- `fs.readdirSync` → `fs.promises.readdir`
- Recursive calls: `await getAllImagesRecursive(...)`
- Caller in `main.ts` adds `await`

### Fix #2: `needsThumbnail()` sync → async with batched filter

- Change return type: `boolean` → `Promise<boolean>`
- `fs.existsSync` → `fs.promises.access` in try/catch
- `fs.statSync` calls → `fs.promises.stat`
- Replace `allImages.filter(needsThumbnail)` with batched async filter:
  - Batch size: 100 concurrent
  - `Promise.all` per batch
  - Check `generationId` between batches to bail early on stale folder selections
  - Event loop is free between batches for IPC handling

### Fix #1: Defer cache cleanup

Wrap `cleanupOrphanedThumbnails()` in `setTimeout(..., 30000)` to move I/O out of the startup window.

### Fix #7: Reduce debounce

Change thumbnail load debounce from 100ms to 50ms in `ImageGrid.tsx`.

## What Doesn't Change

- Queue architecture, priority system, concurrency limits (`ThumbnailQueue` — `getThumbnail` already returns a Promise, so the async conversion in Fix #4 is transparent)
- Renderer code (except 1-line debounce change)
- IPC protocol, preload bridge, and data flow
- Storage format (electron-store schema)
- `cleanupOrphanedThumbnails` logic (already async — just deferred)
- `scanFolder()`, `getSubfolders()`, `getImagesInFolder()`, `fileExists()` — these use sync fs calls but only read a single directory level or do a single stat, so they are fast even at scale. Not worth converting in this pass.

Note: `cleanupOrphanedThumbnails` contention is disk I/O bandwidth, not event loop blocking (the function is already async with batched `Promise.allSettled`). Deferring it via `setTimeout` avoids competing with foreground I/O during the startup window.

## Risk

Low. Every fix is a direct sync→async conversion of existing logic or a trivial scheduling change. No new data flows, no architectural changes. Behavior is identical — only the blocking characteristics change.
