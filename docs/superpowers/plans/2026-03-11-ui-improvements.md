# UI Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add wrap-around image preview navigation, a timer reset button in session mode, and visible sidebar folder toggle controls.

**Architecture:** Three independent UI changes across existing components. No new files — all modifications to existing components, one hook, and CSS.

**Tech Stack:** React, TypeScript, CSS

**Spec:** `docs/superpowers/specs/2026-03-11-ui-improvements-design.md`

---

## Task 1: Image Preview Wrap-Around Navigation

**Files:**
- Modify: `src/components/ImageGrid.tsx:198-217`

- [ ] **Step 1: Update navigation flags and handlers**

Replace lines 198-217 in `ImageGrid.tsx`:

```typescript
  // Preview navigation (wrap-around)
  const currentPreviewIndex = previewImage ? images.indexOf(previewImage) : -1
  const hasPrev = images.length > 1
  const hasNext = images.length > 1

  const handlePreview = useCallback((path: string) => {
    setPreviewImage(path)
  }, [])

  const handlePrevImage = useCallback(() => {
    if (images.length <= 1) return
    const prevIndex = currentPreviewIndex <= 0 ? images.length - 1 : currentPreviewIndex - 1
    setPreviewImage(images[prevIndex])
  }, [currentPreviewIndex, images])

  const handleNextImage = useCallback(() => {
    if (images.length <= 1) return
    const nextIndex = currentPreviewIndex >= images.length - 1 ? 0 : currentPreviewIndex + 1
    setPreviewImage(images[nextIndex])
  }, [currentPreviewIndex, images])
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`. Open a folder with multiple images, click one to preview. Press right arrow at last image — should wrap to first. Press left arrow at first image — should wrap to last. With single image — no nav buttons should appear.

- [ ] **Step 3: Commit**

```bash
git add src/components/ImageGrid.tsx
git commit -m "feat: wrap-around navigation in image preview"
```

---

## Task 2: Session Timer Reset Button

**Files:**
- Modify: `src/hooks/useTimer.ts:57-71`
- Modify: `src/components/SessionView.tsx:125-149,236-246`
- Modify: `src/styles/main.css:661-666`

- [ ] **Step 1: Add `resetAndStop` to useTimer hook**

In `src/hooks/useTimer.ts`, add `resetAndStop` function after the existing `reset` (after line 65), and update the return value:

```typescript
  const resetAndStop = useCallback((newDuration: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setTimeLeft(newDuration)
    setIsPaused(true)
    setResetTrigger(prev => prev + 1)
  }, [])
```

Update the return statement (line 71) to include `resetAndStop`:

```typescript
  return { timeLeft, isPaused, togglePause, reset, resetAndStop }
```

- [ ] **Step 2: Wire up reset button in SessionView**

In `src/components/SessionView.tsx`, destructure `resetAndStop` from `useTimer` (line 125):

```typescript
  const { timeLeft, isPaused, togglePause, reset, resetAndStop } = useTimer({
    duration: current?.duration || 60,
    onComplete: goToNext,
  })
```

Add `handleResetTimer` callback after the `useTimer` call (after line 128):

```typescript
  const handleResetTimer = useCallback(() => {
    if (current) {
      resetAndStop(current.duration)
    }
  }, [current, resetAndStop])
```

Add `KeyR` to the keyboard handler (inside the `useEffect` at line 136, after the `ArrowLeft` handler):

```typescript
      } else if (e.code === 'KeyR') {
        handleResetTimer()
      }
```

Update the `useEffect` dependency array at line 149 to include `handleResetTimer`:

```typescript
  }, [togglePause, goToNext, goToPrevious, handleResetTimer])
```

- [ ] **Step 3: Add reset button UI**

In the session overlay JSX (around line 236), add a reset button row above the existing controls div:

```tsx
        <div className="session-reset">
          <button className="session-btn" onClick={handleResetTimer} title="Reset timer (R)">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3.5 2.5v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.5 7.5A7 7 0 1 1 3 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
```

This goes immediately before the `<div className="session-controls">` line.

- [ ] **Step 4: Add CSS for reset button positioning**

In `src/styles/main.css`, add after the `.session-controls` rule (after line 666):

```css
.session-reset {
  display: flex;
  justify-content: center;
  margin-top: 16px;
  margin-bottom: -8px;
}
```

- [ ] **Step 5: Verify manually**

Run `npm run dev`. Start a session. Let timer count down a few seconds, then press R — timer should reset to full duration and stop. Click play — should start counting again. Click the ↻ button — same behavior. When timer expires (0:00), press R — should reset and stay stopped.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTimer.ts src/components/SessionView.tsx src/styles/main.css
git commit -m "feat: add timer reset button in session mode"
```

---

## Task 3: Sidebar Chevron + Folder Icon Visibility

**Files:**
- Modify: `src/components/Sidebar.tsx:54-95,99-102`
- Modify: `src/styles/main.css:136-175`

- [ ] **Step 1: Replace click handler and expand icon**

In `src/components/Sidebar.tsx`, replace the `handleToggleExpand` callback (lines 54-72) with a unified row click handler:

```typescript
  const handleRowClick = useCallback(async () => {
    onSelect(node.path)

    if (!hasKnownChildren && !hasLoadedChildren) {
      // First click on unloaded folder: select + load + expand
      setIsLoading(true)
      try {
        const subfolders = await window.electronAPI.fs.getSubfolders(node.path)
        setChildren(subfolders)
        setHasLoadedChildren(true)
        if (subfolders.length > 0) {
          setIsExpanded(true)
        }
      } catch (err) {
        console.error('Error loading subfolders:', err)
      }
      setIsLoading(false)
    } else if (isSelected && hasKnownChildren) {
      // Already selected: toggle expand/collapse
      setIsExpanded(prev => !prev)
    } else if (!isSelected && hasKnownChildren && !isExpanded) {
      // Not selected, has children, not expanded: expand
      setIsExpanded(true)
    }
    // Not selected but already expanded: just select, keep expanded
  }, [onSelect, node.path, hasKnownChildren, hasLoadedChildren, isSelected, isExpanded])
```

Remove the old `handleSelect` callback (lines 74-76) since `handleRowClick` replaces it.

- [ ] **Step 2: Replace renderExpandIcon with SVG chevron**

Replace the `renderExpandIcon` function (lines 79-95) with:

```typescript
  const renderChevron = () => {
    if (!node.exists) return <span style={{ width: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, opacity: 0.5 }}>!</span>
    if (isLoading) return <span style={{ width: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, opacity: 0.4 }}>...</span>
    if (hasKnownChildren) {
      return (
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className={`folder-chevron ${isExpanded ? 'expanded' : ''}`}
        >
          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    }
    return <span style={{ width: 14 }}></span>
  }
```

- [ ] **Step 3: Update folder icon and row JSX**

Replace the return JSX (lines 97-129) to use the new handlers and bigger icons:

```tsx
  return (
    <div>
      <div
        className={`folder-item ${isSelected ? 'selected' : ''} ${!node.exists ? 'missing' : ''}`}
        onClick={handleRowClick}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {renderChevron()}
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          style={{ opacity: 0.85, flexShrink: 0 }}
        >
          {isExpanded ? (
            <path d="M1.5 3.5h13c.28 0 .5.22.5.5v8c0 .28-.22.5-.5.5h-13c-.28 0-.5-.22-.5-.5V4c0-.28.22-.5.5-.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          ) : (
            <path d="M1.5 3.5h5l1 1.5h6.5c.28 0 .5.22.5.5v6.5c0 .28-.22.5-.5.5h-12c-.28 0-.5-.22-.5-.5v-8c0-.28.22-.5.5-.5z" stroke="currentColor" strokeWidth="1.2" fill="none"/>
          )}
        </svg>
        <span className="folder-item-name">{node.name}</span>
      </div>
      {isExpanded && children.length > 0 && children.map(child => (
        <FolderTreeItem
          key={child.path}
          node={child}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  )
```

- [ ] **Step 4: Add chevron CSS**

In `src/styles/main.css`, add after the `.folder-item-name` rule (after line 175):

```css
.folder-chevron {
  flex-shrink: 0;
  opacity: 0.7;
  transition: transform var(--transition-fast);
}

.folder-chevron.expanded {
  transform: rotate(90deg);
}
```

- [ ] **Step 5: Verify manually**

Run `npm run dev`. Check sidebar: chevrons and folder icons should be clearly visible. Click a folder — selects it and expands children. Click again — collapses. Click a different folder — selects and expands. Folders without children should show folder icon only, no chevron.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sidebar.tsx src/styles/main.css
git commit -m "feat: visible chevron + folder icon sidebar toggles"
```
