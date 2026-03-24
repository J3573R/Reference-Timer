# Quickstart Mode Design

## Summary

Add a fourth session mode — **Quickstart** — where the timer counts up instead of down. The user draws each reference at their own pace, manually advancing to the next image. Per-image time spent and session totals are tracked and saved to history using the existing data model.

## Motivation

The existing modes (simple, class, progressive) are all countdown-based. Sometimes the user wants to draw without time pressure — just pick some references, start drawing, and see how long each one took afterward. Quickstart Mode provides that free-form experience while still capturing timing data.

## Design

### Types & Data Model

- Add `'quickstart'` to the session mode union in **both** locations:
  - `SessionModal.tsx`: the local `SessionMode` type alias
  - `shared/types.ts`: the inline union on `Session.mode`
- Make `timePerImage` optional in `SessionConfig` (`timePerImage?: number`). Quickstart sessions omit it entirely. The `simple` and `class` branches in `buildSessionQueue` must use `config.timePerImage ?? 60` (defaulting to 60) to guard against `undefined` now that the field is optional.
- `Session` and `SessionImage` are unchanged — `timeSpent` already captures per-image duration.
- In the session queue, quickstart entries use `duration: 0` as the sentinel for "count up, no auto-advance."

### `useTimer` Hook

Current behavior: starts at `duration`, counts down by 1/sec, calls `onComplete` at 0.

New behavior when `duration === 0` (count-up mode):
- Start at 0, count up by 1/sec.
- The `timeLeft` state variable represents elapsed time (counts up instead of down).
- Never calls `onComplete` — no auto-advance.
- Pause/resume works identically to countdown mode.
- `reset(0)` resets to 0 and starts counting up.
- `resetAndStop(0)` resets to 0 and stays paused.

**Required internal changes:**
- The early-return guard `if (isPaused || timeLeft <= 0)` must become `if (isPaused || (timeLeft <= 0 && duration !== 0))` so that count-up mode can start from 0.
- The interval callback must branch: when `duration === 0`, increment (`prev + 1`) instead of decrement. Skip the `onComplete` check entirely.
- **Stale closure fix**: The `duration` parameter is not currently in the effect's dependency array — it's only used to initialize `timeLeft`. The interval callback must read `duration` from a `useRef` (like the existing `onCompleteRef` pattern) so it always sees the current value, not a stale closure capture from effect-run time.

The hook's public interface is unchanged.

### SessionModal

- Add "Quickstart" as a fourth mode option alongside Simple, Class, and Progressive.
- When Quickstart is selected, hide all timing configuration (time per image, image count, stages/presets).
- Show a brief description: "Draw at your own pace. Timer counts up."
- Total time estimate shows "Unlimited" or is hidden.
- **`handleStart` function**: Currently unconditionally sets `timePerImage` on the config object. Must add a quickstart branch that omits `timePerImage` — otherwise the state default (60) leaks through and quickstart sessions launch as 60-second countdowns.
- **`getTotalImages()`**: Add quickstart branch returning `selectedCount` (same as simple).
- **`getTotalTime()`**: Add quickstart branch — return 0 or a sentinel so the display shows "Unlimited" instead of a number.

### SessionView

- **Queue building**: Add a `quickstart` branch in `buildSessionQueue`. For quickstart mode, all selected images get `duration: 0`. All images are included (same as simple mode behavior).
- **Timer initialization**: The `current?.duration || 60` fallback must be changed to avoid coercing `0` to `60`. Use explicit check: `current ? current.duration : 60`.
- **Timer display**: When `duration === 0`, display the count-up value formatted as `MM:SS` (or `HH:MM:SS` if elapsed >= 1 hour). The existing `formatTime` function must be extended to support hours.
- **Warning class**: Suppress the `session-timer warning` CSS class in count-up mode (currently triggers when `timeLeft <= 5`, which would fire for the first 5 seconds of every count-up).
- **Reset button (R key)**: Hide or disable in quickstart mode. Resetting a stopwatch mid-image would lose elapsed time, which is confusing UX.
- **Auto-advance disabled**: `onComplete` callback is a no-op (timer never fires it).
- **Manual controls**: Next button and ArrowRight work unchanged. Spacebar pauses/resumes.
- **Previous button and ArrowLeft**: Disable both the previous button and the `ArrowLeft` keyboard handler in quickstart mode. Going back currently discards the recorded time for the prior image (`setSessionImages(prev => prev.slice(0, -1))`). In quickstart, where per-image time is the core value, this data loss is unacceptable. Disabling "previous" avoids the problem entirely — quickstart is a forward-only flow.
- **Auto-start on image load**: The timer auto-starts when the image loads (same as countdown modes). This is intentional — the user has already committed to drawing by starting the session, and having to press spacebar before each image would be tedious friction.
- **Audio chime**: Already plays on `goToNext()` which fires on manual next — no change needed.

### Session Rerun

The existing `handleRerunSession` in `App.tsx` reconstructs config as `timePerImage: session.images[0]?.timeSpent || 60`. For quickstart sessions, this would incorrectly use elapsed time as a countdown duration. Fix: when `session.mode === 'quickstart'`, rerun as quickstart mode (set `mode: 'quickstart'`, omit `timePerImage`).

### Session Completion & History

- Completion triggers the same way: user advances past the last image, or ends early via "End Session."
- Completion screen shows image count and total elapsed time, identical to other modes.
- Session saved with `mode: 'quickstart'`. History view displays it with the "Quickstart" mode label.
- Per-image `timeSpent` recorded via existing `imageStartTime` tracking — no changes needed.

### Unchanged Systems

- Image prefetching and shuffling
- Keyboard shortcuts (except R key and ArrowLeft disabled in quickstart)
- Pause overlay
- Settings (audio chime applies to manual next, no code change needed)
- Electron-store keys and IPC channels
- HistoryView component (just displays the new mode label). Note: `formatDuration` in HistoryView should also be extended to support hours, since quickstart sessions can easily exceed 60 minutes.

## Approach

Extend the existing `useTimer` hook with count-up behavior (Approach A from brainstorming). This is the least code, keeps everything unified, and avoids duplicating pause/resume logic.

Alternatives considered and rejected:
- **Separate `useStopwatch` hook**: Clean separation but duplicates pause/resume logic and requires branching in SessionView.
- **Raw `Date.now()` tracking**: Simplest but reimplements time display and pause outside the hook, diverging from existing patterns.
