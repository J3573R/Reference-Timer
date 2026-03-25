# UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add refresh folders button, history image preview, quickstart-first tab order, and fix sidebar horizontal scrollbar.

**Architecture:** Four independent changes touching TopBar, App.tsx, HistoryView, SessionModal, and main.css. All reuse existing infrastructure — no new IPC channels or components.

**Tech Stack:** React, TypeScript, Electron, CSS

**Spec:** `docs/superpowers/specs/2026-03-25-ui-enhancements-design.md`

**No test framework is configured** — all verification is manual via `npm run dev`.

---

### Task 1: Fix Sidebar Horizontal Scrollbar

**Files:**
- Modify: `src/styles/main.css:102-108` (`.sidebar` rule)

- [ ] **Step 1: Add overflow-x: hidden and overflow-wrap to .sidebar**

In `src/styles/main.css`, find the `.sidebar` rule (line 102) and update it:

```css
.sidebar {
  width: 260px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-subtle);
  overflow-y: auto;
  overflow-x: hidden;
  overflow-wrap: break-word;
  padding: 12px 8px;
}
```

Two additions:
- `overflow-x: hidden` — prevents horizontal scrollbar
- `overflow-wrap: break-word` — long folder names wrap instead of overflowing

- [ ] **Step 2: Verify**

Run: `npm run dev`
- Open the app, add a folder with a long name
- Confirm no horizontal scrollbar appears on the sidebar
- Confirm folder names wrap or truncate cleanly

- [ ] **Step 3: Commit**

```bash
git add src/styles/main.css
git commit -m "fix: hide sidebar horizontal scrollbar"
```

---

### Task 2: Reorder Quickstart Tab to First Position

**Files:**
- Modify: `src/components/SessionModal.tsx:39` (default mode state)
- Modify: `src/components/SessionModal.tsx:141` (tab order array)

- [ ] **Step 1: Change default mode to quickstart**

In `src/components/SessionModal.tsx` line 39, change:

```typescript
// Before
const [mode, setMode] = useState<SessionMode>('simple')

// After
const [mode, setMode] = useState<SessionMode>('quickstart')
```

- [ ] **Step 2: Reorder tab array**

In `src/components/SessionModal.tsx` line 141, change:

```typescript
// Before
{(['simple', 'class', 'progressive', 'quickstart'] as const).map(m => (

// After
{(['quickstart', 'simple', 'class', 'progressive'] as const).map(m => (
```

- [ ] **Step 3: Verify**

Run: `npm run dev`
- Open Session Modal (select images first, click Start Session)
- Confirm Quickstart tab appears first (leftmost)
- Confirm Quickstart tab is selected by default
- Confirm other tabs still work correctly when clicked

- [ ] **Step 4: Commit**

```bash
git add src/components/SessionModal.tsx
git commit -m "feat: make quickstart the first and default session tab"
```

---

### Task 3: Add Refresh Source Folders Button

**Files:**
- Modify: `src/components/TopBar.tsx` (add button and prop)
- Modify: `src/App.tsx` (add handler, pass prop)

- [ ] **Step 1: Add onRefreshFolders prop and button to TopBar**

In `src/components/TopBar.tsx`, update the interface and component:

```typescript
interface TopBarProps {
  selectedCount: number
  onHistory: () => void
  onSettings: () => void
  onStartSession: () => void
  onRefreshFolders: () => void
  hasFolders: boolean
  thumbnailProgress?: { current: number; total: number } | null
}

export default function TopBar({ selectedCount, onHistory, onSettings, onStartSession, onRefreshFolders, hasFolders, thumbnailProgress }: TopBarProps) {
```

Add the refresh button inside `top-bar-actions`, before the Settings button:

```tsx
<div className="top-bar-actions">
  <button
    className="btn btn-icon"
    onClick={onRefreshFolders}
    disabled={!hasFolders}
    title="Refresh folders"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 1v4h4" />
      <path d="M15 15v-4h-4" />
      <path d="M13.5 6A6 6 0 0 0 3.8 3.8L1 5M15 11l-2.8 1.2A6 6 0 0 1 2.5 10" />
    </svg>
  </button>
  <button className="btn btn-secondary" onClick={onSettings}>
    Settings
  </button>
```

- [ ] **Step 2: Add handleRefreshFolders in App.tsx**

In `src/App.tsx`, add the handler after `handleCleanupFavorites` (after line 225):

```typescript
const handleRefreshFolders = useCallback(() => {
  if (referenceFolders.length === 0) return
  Promise.all(
    referenceFolders.map(f => window.electronAPI.fs.scanFolder(f))
  ).then(trees => {
    setFolderTrees(trees)
    if (selectedPath && selectedPath !== '__favorites__') {
      window.electronAPI.fs.getImagesInFolder(selectedPath).then(setCurrentImages)
      window.electronAPI.fs.generateThumbnailsInBackground([selectedPath])
    }
  })
}, [referenceFolders, selectedPath])
```

This rescans all folder trees, then reloads images for the currently selected folder and triggers thumbnail generation for any newly discovered images.

- [ ] **Step 3: Pass props to TopBar**

In `src/App.tsx`, update the `<TopBar>` JSX (line 283):

```tsx
<TopBar
  selectedCount={selectedImages.size}
  onHistory={() => setShowHistory(true)}
  onSettings={() => setShowSettings(true)}
  onStartSession={() => setShowSessionModal(true)}
  onRefreshFolders={handleRefreshFolders}
  hasFolders={referenceFolders.length > 0}
  thumbnailProgress={thumbnailProgress}
/>
```

- [ ] **Step 4: Add disabled state to existing .btn-icon**

A `.btn-icon` rule already exists at `src/styles/main.css:393-406` (used by SessionModal's stage remove button). Do NOT replace it. Just add a `:disabled` rule after the existing `.btn-icon:hover` rule (after line 406):

```css
.btn-icon:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

- [ ] **Step 5: Verify**

Run: `npm run dev`
- Confirm refresh icon appears next to Settings button
- With no folders: confirm button is visually disabled
- Add a folder, then add new images to that folder on disk
- Click refresh — confirm new images appear in the grid
- Confirm thumbnail generation runs for the current folder

- [ ] **Step 6: Commit**

```bash
git add src/components/TopBar.tsx src/App.tsx src/styles/main.css
git commit -m "feat: add refresh source folders button to top bar"
```

---

### Task 4: Add Image Preview to History View

**Files:**
- Modify: `src/components/HistoryView.tsx` (add ImagePreview integration)
- Modify: `src/styles/main.css` (cursor style on history images)

- [ ] **Step 1: Add ImagePreview import and state to HistoryView**

In `src/components/HistoryView.tsx`, add the `ImagePreview` import after the existing `useState` import (line 1). The file already imports `useState` and `Session` — only add the new line:

```typescript
import { useState } from 'react'
import ImagePreview from './ImagePreview'
import type { Session } from '../types'
```

Add preview state after the existing `expandedId` state (line 12):

```typescript
const [expandedId, setExpandedId] = useState<string | null>(null)
const [previewSession, setPreviewSession] = useState<Session | null>(null)
const [previewIndex, setPreviewIndex] = useState(0)
```

- [ ] **Step 2: Add click handler to history image thumbnails**

In `src/components/HistoryView.tsx`, update the history image div (line 92) to add an onClick:

```tsx
<div key={i} className="history-image" onClick={() => {
  setPreviewSession(session)
  setPreviewIndex(i)
}}>
  <img src={`file://${img.path}`} alt="" />
  <div className="history-image-time">{formatDuration(img.timeSpent)}</div>
</div>
```

- [ ] **Step 3: Render ImagePreview when a session image is selected**

In `src/components/HistoryView.tsx`, add the ImagePreview render just before the closing `</div>` of the `history-view` container (before line 114):

```tsx
      </div>

      {previewSession && (
        <ImagePreview
          imagePath={previewSession.images[previewIndex].path}
          imageList={previewSession.images.map(img => img.path)}
          currentIndex={previewIndex}
          onClose={() => setPreviewSession(null)}
          onPrev={() => setPreviewIndex(i => i - 1)}
          onNext={() => setPreviewIndex(i => i + 1)}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex < previewSession.images.length - 1}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add cursor pointer to history images**

In `src/styles/main.css`, find the `.history-image` rule and add `cursor: pointer`. If the rule looks like:

```css
.history-image {
  /* existing styles */
}
```

Add `cursor: pointer;` to it.

- [ ] **Step 5: Verify**

Run: `npm run dev`
- Complete a drawing session (or have existing history)
- Open History, expand a session
- Click any image thumbnail — confirm ImagePreview opens full-size
- Use arrow keys or nav buttons to browse through that session's images
- Press Escape — confirm preview closes but history stays open
- Confirm cursor changes to pointer on hover over history thumbnails

- [ ] **Step 6: Commit**

```bash
git add src/components/HistoryView.tsx src/styles/main.css
git commit -m "feat: add image preview browsing to session history"
```
