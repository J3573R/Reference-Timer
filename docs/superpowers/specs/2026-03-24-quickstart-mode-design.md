# Quickstart Mode Design

## Summary

Add a fourth session mode — **Quickstart** — where the timer counts up instead of down. The user draws each reference at their own pace, manually advancing to the next image. Per-image time spent and session totals are tracked and saved to history using the existing data model.

## Motivation

The existing modes (simple, class, progressive) are all countdown-based. Sometimes the user wants to draw without time pressure — just pick some references, start drawing, and see how long each one took afterward. Quickstart Mode provides that free-form experience while still capturing timing data.

## Design

### Types & Data Model

- Add `'quickstart'` to the `SessionMode` union: `'simple' | 'class' | 'progressive' | 'quickstart'`
- No new types or interfaces. `SessionConfig` gains a new mode value but no new fields.
- `Session` and `SessionImage` are unchanged — `timeSpent` already captures per-image duration.
- In the session queue, quickstart entries use `duration: 0` as the sentinel for "count up, no auto-advance."

### `useTimer` Hook

Current behavior: starts at `duration`, counts down by 1/sec, calls `onComplete` at 0.

New behavior when `duration === 0`:
- Start at 0, count up by 1/sec.
- The `timeLeft` state variable represents elapsed time (counts up instead of down).
- Never calls `onComplete` — no auto-advance.
- Pause/resume works identically to countdown mode.
- `reset(0)` resets to 0 and starts counting up.
- `resetAndStop(0)` resets to 0 and stays paused.

The hook's public interface is unchanged.

### SessionModal

- Add "Quickstart" as a fourth mode option alongside Simple, Class, and Progressive.
- When Quickstart is selected, hide all timing configuration (time per image, image count, stages/presets).
- Show a brief description: "Draw at your own pace. Timer counts up."
- Total time estimate shows "Unlimited" or is hidden.
- `handleStartSession` passes `{ mode: 'quickstart' }` with no timing fields.

### SessionView

- **Queue building**: For quickstart mode, all selected images get `duration: 0`. All images are included (same as simple mode behavior).
- **Timer display**: When `duration === 0`, display the count-up value formatted as `MM:SS` (or `HH:MM:SS` if elapsed >= 1 hour).
- **Auto-advance disabled**: `onComplete` callback is a no-op (timer never fires it).
- **Manual controls**: Next/previous buttons and arrow keys work unchanged. Spacebar pauses/resumes.
- **Audio chime**: Plays on manual next if the chime setting is enabled.

### Session Completion & History

- Completion triggers the same way: user advances past the last image, or ends early via "End Session."
- Completion screen shows image count and total elapsed time, identical to other modes.
- Session saved with `mode: 'quickstart'`. History view displays it with the "Quickstart" mode label.
- Per-image `timeSpent` recorded via existing `imageStartTime` tracking — no changes needed.

### Unchanged Systems

- Image prefetching and shuffling
- Keyboard shortcuts
- Pause overlay
- Settings (audio chime applies to manual next)
- Electron-store keys and IPC channels
- HistoryView component (just displays the new mode label)

## Approach

Extend the existing `useTimer` hook with count-up behavior (Approach A from brainstorming). This is the least code, keeps everything unified, and avoids duplicating pause/resume logic.

Alternatives considered and rejected:
- **Separate `useStopwatch` hook**: Clean separation but duplicates pause/resume logic and requires branching in SessionView.
- **Raw `Date.now()` tracking**: Simplest but reimplements time display and pause outside the hook, diverging from existing patterns.
