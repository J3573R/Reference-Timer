# Quickstart Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Quickstart" session mode where the timer counts up, the user advances images manually, and per-image time is tracked.

**Architecture:** Extend the existing `useTimer` hook with count-up behavior when `duration === 0`. Add a quickstart branch to the session modal and session view. All existing data structures are reused — `Session` and `SessionImage` are unchanged.

**Tech Stack:** Electron, React, TypeScript, Vite. No test framework configured.

**Spec:** `docs/superpowers/specs/2026-03-24-quickstart-mode-design.md`

---

### Task 1: Add `'quickstart'` to type definitions

**Files:**
- Modify: `shared/types.ts:19` — add `'quickstart'` to `Session.mode` union
- Modify: `src/components/SessionModal.tsx:5` — add `'quickstart'` to `SessionMode` type
- Modify: `src/components/SessionModal.tsx:9` — make `timePerImage` optional

- [ ] **Step 1: Update `Session.mode` in shared types**

In `shared/types.ts`, change line 19 from:
```typescript
  mode: 'simple' | 'class' | 'progressive'
```
to:
```typescript
  mode: 'simple' | 'class' | 'progressive' | 'quickstart'
```

- [ ] **Step 2: Update `SessionMode` in SessionModal**

In `src/components/SessionModal.tsx`, change line 5 from:
```typescript
type SessionMode = 'simple' | 'class' | 'progressive'
```
to:
```typescript
type SessionMode = 'simple' | 'class' | 'progressive' | 'quickstart'
```

- [ ] **Step 3: Make `timePerImage` optional**

In `src/components/SessionModal.tsx`, change line 9 from:
```typescript
  timePerImage: number
```
to:
```typescript
  timePerImage?: number
```

- [ ] **Step 4: Verify the app compiles**

Run: `npm run build`
Expected: Build succeeds. TypeScript may report errors in files that use `config.timePerImage` without null checks — these will be fixed in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts src/components/SessionModal.tsx
git commit -m "feat: add quickstart to session mode types, make timePerImage optional"
```

---

### Task 2: Add count-up mode to `useTimer` hook

**Files:**
- Modify: `src/hooks/useTimer.ts`

- [ ] **Step 1: Add a `durationRef` to track current duration**

After line 13 (`const onCompleteRef = useRef(onComplete)`), add:
```typescript
const durationRef = useRef(duration)
```

And after line 17 (`onCompleteRef.current = onComplete`), add a similar effect:
```typescript
useEffect(() => {
  durationRef.current = duration
}, [duration])
```

- [ ] **Step 2: Change the early-return guard to allow count-up from 0**

Change line 29 from:
```typescript
    if (isPaused || timeLeft <= 0) {
```
to:
```typescript
    if (isPaused || (timeLeft <= 0 && durationRef.current !== 0)) {
```

This allows the effect to proceed when `timeLeft === 0` and we're in count-up mode (`duration === 0`).

**Important:** Do NOT add `timeLeft` to the effect's dependency array `[isPaused, resetTrigger]`. Reading `timeLeft` from the closure here is intentional — adding it as a dependency would cause the interval to be cleared and recreated every second, breaking the timer.

- [ ] **Step 3: Branch the interval callback for count-up vs countdown**

Replace lines 34–45 (the entire `window.setInterval` callback) with:
```typescript
    intervalRef.current = window.setInterval(() => {
      if (durationRef.current === 0) {
        // Count-up mode
        setTimeLeft(prev => prev + 1)
      } else {
        // Countdown mode
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
            onCompleteRef.current()
            return 0
          }
          return prev - 1
        })
      }
    }, 1000)
```

- [ ] **Step 4: Verify the app compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
- Start a simple session with a few images — verify countdown still works as before.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTimer.ts
git commit -m "feat: add count-up mode to useTimer when duration is 0"
```

---

### Task 3: Add quickstart mode to SessionModal

**Files:**
- Modify: `src/components/SessionModal.tsx`

- [ ] **Step 1: Add quickstart to the mode tabs**

Change line 134 from:
```typescript
        {(['simple', 'class', 'progressive'] as const).map(m => (
```
to:
```typescript
        {(['simple', 'class', 'progressive', 'quickstart'] as const).map(m => (
```

- [ ] **Step 2: Add quickstart description below mode tabs**

After the closing `</div>` of the mode-tabs div (after line 143), add:
```tsx
      {mode === 'quickstart' && (
        <div className="form-group">
          <p style={{ color: '#888', fontSize: 13, margin: 0 }}>
            Draw at your own pace. Timer counts up.
          </p>
        </div>
      )}
```

- [ ] **Step 3: Add quickstart branch to `handleStart`**

Replace lines 84–101 (the entire `handleStart` function) with:
```typescript
  const handleStart = () => {
    if (mode === 'quickstart') {
      onStart({ mode })
      return
    }

    const config: SessionConfig = {
      mode,
      timePerImage,
    }

    if (mode === 'class') {
      config.imageCount = imageCount
    } else if (mode === 'progressive') {
      if (selectedPreset && selectedPreset !== 'custom') {
        config.preset = selectedPreset
      } else {
        config.customStages = customStages
      }
    }

    onStart(config)
  }
```

- [ ] **Step 4: Add quickstart branches to `getTotalImages` and `getTotalTime`**

Replace lines 111–121 with:
```typescript
  const getTotalImages = (): number => {
    if (mode === 'quickstart') return selectedCount
    if (mode === 'simple') return selectedCount
    if (mode === 'class') return Math.min(imageCount, selectedCount)
    return getProgressiveStages().reduce((sum, s) => sum + s.count, 0)
  }

  const getTotalTime = (): number | null => {
    if (mode === 'quickstart') return null
    if (mode === 'simple') return selectedCount * timePerImage
    if (mode === 'class') return Math.min(imageCount, selectedCount) * timePerImage
    return getProgressiveStages().reduce((sum, s) => sum + s.duration * s.count, 0)
  }
```

- [ ] **Step 5: Update the session summary display**

Replace lines 261–262:
```tsx
        <strong style={{ color: '#e0e0e0' }}>Session summary:</strong><br />
        {getTotalImages()} images • {formatTime(getTotalTime())} total
```
with:
```tsx
        <strong style={{ color: '#e0e0e0' }}>Session summary:</strong><br />
        {(() => { const t = getTotalTime(); return `${getTotalImages()} images${t !== null ? ` • ${formatTime(t)} total` : ' • Unlimited'}` })()}
```

Note: We store `getTotalTime()` in a local variable `t` so TypeScript can narrow the `null` check — calling `getTotalTime()` twice would not narrow, causing a compile error.

- [ ] **Step 6: Verify the app compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionModal.tsx
git commit -m "feat: add quickstart mode tab and config to SessionModal"
```

---

### Task 4: Add quickstart branch to `buildSessionQueue` and fix duration fallback

**Files:**
- Modify: `src/components/SessionView.tsx`

- [ ] **Step 1: Add quickstart branch to `buildSessionQueue`**

After the progressive `else if` block (after line 57, before the closing `return queue`), add:
```typescript
  } else if (config.mode === 'quickstart') {
    for (const img of images) {
      queue.push({ imagePath: img, duration: 0 })
    }
  }
```

- [ ] **Step 2: Add null guard for `timePerImage` in existing branches**

On line 26, change:
```typescript
      queue.push({ imagePath: img, duration: config.timePerImage })
```
to:
```typescript
      queue.push({ imagePath: img, duration: config.timePerImage ?? 60 })
```

On line 31, change:
```typescript
      queue.push({ imagePath: images[i], duration: config.timePerImage })
```
to:
```typescript
      queue.push({ imagePath: images[i], duration: config.timePerImage ?? 60 })
```

- [ ] **Step 3: Fix the duration fallback on timer initialization**

Change line 121 from:
```typescript
    duration: current?.duration || 60,
```
to:
```typescript
    duration: current ? current.duration : 60,
```

- [ ] **Step 4: Verify the app compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/SessionView.tsx
git commit -m "feat: add quickstart branch to session queue, fix duration fallback"
```

---

### Task 5: Update SessionView UI for quickstart mode

**Files:**
- Modify: `src/components/SessionView.tsx`

- [ ] **Step 1: Extend `formatTime` to support hours**

Replace lines 211–218 (the `formatTime` function) with:
```typescript
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    return `${secs}`
  }
```

- [ ] **Step 2: Suppress warning class in count-up mode**

Change line 270 from:
```tsx
        <div className={`session-timer ${timeLeft <= 5 ? 'warning' : ''}`}>
```
to:
```tsx
        <div className={`session-timer ${current?.duration !== 0 && timeLeft <= 5 ? 'warning' : ''}`}>
```

- [ ] **Step 3: Hide reset button in quickstart mode**

Wrap the reset button div (lines 279–286) with a conditional:
```tsx
        {current?.duration !== 0 && (
          <div className="session-reset">
            <button className="session-btn" onClick={handleResetTimer} title="Reset timer (R)">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M3.5 2.5v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.5 7.5A7 7 0 1 1 3 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
```

- [ ] **Step 4: Add defensive guard to `goToPrevious`**

In `goToPrevious` (line 112), add an early return for quickstart mode to prevent data loss even if a future code path bypasses the UI guards:

Change:
```typescript
  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
```
to:
```typescript
  const goToPrevious = useCallback(() => {
    if (current?.duration === 0) return  // quickstart: prevent time data loss
    if (currentIndex > 0) {
```

- [ ] **Step 5: Disable previous button in quickstart mode**

Change line 288 from:
```tsx
          <button className="session-btn" onClick={goToPrevious} disabled={currentIndex === 0}>
```
to:
```tsx
          <button className="session-btn" onClick={goToPrevious} disabled={currentIndex === 0 || current?.duration === 0}>
```

- [ ] **Step 6: Disable ArrowLeft and R key in quickstart mode**

Replace lines 162–177 (the keyboard handler effect) with:
```typescript
  useEffect(() => {
    const isQuickstart = current?.duration === 0
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handleTogglePause()
      } else if (e.code === 'ArrowRight') {
        goToNext()
      } else if (e.code === 'ArrowLeft' && !isQuickstart) {
        goToPrevious()
      } else if (e.code === 'KeyR' && !isQuickstart) {
        handleResetTimer()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleTogglePause, goToNext, goToPrevious, handleResetTimer, current?.duration])
```

- [ ] **Step 7: Verify the app compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/SessionView.tsx
git commit -m "feat: update SessionView UI for quickstart mode"
```

---

### Task 6: Fix session rerun for quickstart and update HistoryView

**Files:**
- Modify: `src/App.tsx:233-243`
- Modify: `src/components/HistoryView.tsx:25-30`

- [ ] **Step 1: Fix `handleRerunSession` in App.tsx**

Replace lines 233–243 with:
```typescript
  const handleRerunSession = useCallback((session: Session) => {
    setShowHistory(false)
    if (session.mode === 'quickstart') {
      setActiveSession({
        config: { mode: 'quickstart' },
        images: shuffleArray(session.images.map(img => img.path)),
      })
    } else {
      setActiveSession({
        config: {
          mode: session.mode,
          timePerImage: session.images[0]?.timeSpent || 60,
          preset: session.preset,
        },
        images: shuffleArray(session.images.map(img => img.path)),
      })
    }
  }, [])
```

- [ ] **Step 2: Extend `formatDuration` in HistoryView to support hours**

Replace lines 25–30 in `src/components/HistoryView.tsx` with:
```typescript
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`
    if (mins === 0) return `${secs}s`
    return `${mins}m ${secs}s`
  }
```

- [ ] **Step 3: Verify the app compiles**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/HistoryView.tsx
git commit -m "feat: fix quickstart session rerun, add hours to HistoryView formatDuration"
```

---

### Task 7: End-to-end manual verification

**Files:** None (verification only)

- [ ] **Step 1: Start the app**

Run: `npm run dev`

- [ ] **Step 2: Test quickstart session flow**

1. Select a folder and pick 3-5 images
2. Click "Start Session" → verify "Quickstart" tab appears in modal
3. Select Quickstart → verify timing config is hidden, summary shows "X images • Unlimited"
4. Click "Start Session" → verify timer counts UP from 0:00
5. Wait a few seconds, verify timer increments
6. Press Space → verify pause works, timer stops
7. Press Space → verify resume, timer continues
8. Verify previous button is disabled (grayed out)
9. Press ArrowLeft → verify nothing happens
10. Press R → verify nothing happens (no reset)
11. Press ArrowRight → advance to next image, verify chime plays (if enabled), timer resets to 0:00

- [ ] **Step 3: Test session completion**

1. Advance through all images
2. Verify completion screen shows image count and total time
3. Click "Save & Exit" → verify session appears in history as "Quickstart"
4. Expand the history entry → verify per-image times are recorded

- [ ] **Step 4: Test quickstart rerun**

1. Open history, find the quickstart session
2. Click "Rerun" → verify it opens as a quickstart session (count-up, not countdown)

- [ ] **Step 5: Test existing modes still work**

1. Start a Simple session → verify countdown works as before
2. Start a Class session → verify countdown works as before
3. Verify previous button works in countdown modes
4. Verify R key resets timer in countdown modes

- [ ] **Step 6: Test early exit**

1. Start a quickstart session
2. Click "End Session" → confirm dialog → verify session saved with incomplete status
