# UI Enhancements Design Spec

**Date:** 2026-03-25
**Scope:** Four independent UI improvements to Reference Timer

---

## 1. Refresh Source Folders Button

### Problem
When images are added to source folders on disk, the app has no way to pick them up without removing and re-adding the folder.

### Design

**TopBar.tsx** — Add a refresh icon button to `top-bar-actions`, placed to the left of the Settings button.

- New prop: `onRefreshFolders: () => void`
- Button uses a circular-arrow SVG icon, styled as `btn-icon` (no text label, just the icon)
- Disable button when `referenceFolders.length === 0` for visual consistency
- Temporarily disable for ~500ms after click to prevent rapid repeated clicks

**App.tsx** — Define `handleRefreshFolders`:

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

This mirrors the existing `useEffect` at lines 66-75, plus reloads images for the currently selected folder and triggers thumbnail generation for newly discovered images. The `__favorites__` path is skipped since favorites are manually curated. Pass `onRefreshFolders={handleRefreshFolders}` to `<TopBar>`.

### Files Changed
- `src/components/TopBar.tsx` — new prop, new button
- `src/App.tsx` — new handler, pass prop

---

## 2. History Image Preview

### Problem
Users can see thumbnails of past session images in HistoryView but cannot view them full-size or browse through them.

### Design

**HistoryView.tsx** — Import `ImagePreview` from `'./ImagePreview'`. Add state for image preview and render the existing component.

New state:
```typescript
const [previewSession, setPreviewSession] = useState<Session | null>(null)
const [previewIndex, setPreviewIndex] = useState(0)
```

On clicking a history image thumbnail (the `<div className="history-image">` at line 92), set `previewSession` to the current session and `previewIndex` to `i`.

Render `ImagePreview` when `previewSession` is set:
```tsx
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
```

Add `cursor: pointer` to `.history-image` in CSS so it's clear the thumbnails are clickable.

**Known limitation:** If images have been deleted or moved from disk after a session, the preview will show a broken image. This is a pre-existing issue (thumbnails in HistoryView line 93 already load directly from disk paths) and is out of scope for this change.

### Files Changed
- `src/components/HistoryView.tsx` — import, state, click handler, ImagePreview render
- `src/styles/main.css` — cursor style on `.history-image`

---

## 3. Quickstart Tab First in SessionModal

### Problem
Quickstart is the last tab in the session mode selector, but it should be first.

### Design

**SessionModal.tsx line 141** — Change the tab order array:

```typescript
// Before
{(['simple', 'class', 'progressive', 'quickstart'] as const).map(m => ...)}

// After
{(['quickstart', 'simple', 'class', 'progressive'] as const).map(m => ...)}
```

Also update the default `mode` state initialization (line ~15) from `'simple'` to `'quickstart'` so the first tab is selected by default when opening the modal. This is intentional — quickstart is the most common workflow and its minimal UI (no timer config) is a good default landing state.

### Files Changed
- `src/components/SessionModal.tsx` — reorder array, update default mode

---

## 4. Remove Horizontal Scrollbars

### Problem
The sidebar and possibly the image grid area show horizontal scrollbars that shouldn't be there. Content should scale to fit the available width.

### Design

**Sidebar CSS** — The `.sidebar` rule (main.css line 102) has `overflow-y: auto` but no explicit `overflow-x` (defaults to `visible`). Add `overflow-x: hidden` to prevent horizontal scrollbar. Add `overflow-wrap: break-word` (preferred over `word-break`) to handle long folder names gracefully.

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

**Image grid area** — `.image-grid-container` already has `overflow: hidden` (main.css line 191), so no changes needed there. The scrollbar issue is sidebar-only.

### Files Changed
- `src/styles/main.css` — overflow rules on `.sidebar`

---

## Summary of All Changes

| Feature | Files | Complexity |
|---------|-------|-----------|
| Refresh folders button | TopBar.tsx, App.tsx | Small — new button + handler |
| History image preview | HistoryView.tsx, main.css | Small — reuse ImagePreview component |
| Quickstart tab first | SessionModal.tsx | Trivial — reorder array + default |
| No horizontal scrollbars | main.css | Trivial — CSS overflow rules |

All features are independent and can be implemented in any order. No new components, no new IPC channels, no architectural changes.

---

## Manual Verification

1. **Refresh folders:** Add new images to a source folder on disk. Click refresh button. Verify new images appear in the grid. Verify button is disabled when no folders are configured.
2. **History preview:** Complete a session. Open History. Expand a session. Click an image thumbnail. Verify ImagePreview opens with prev/next navigation through that session's images. Verify Escape closes preview (not history).
3. **Quickstart first:** Open session modal. Verify Quickstart tab is first and selected by default.
4. **No scrollbars:** Add a folder with a long name. Verify sidebar has no horizontal scrollbar. Resize window narrow — verify no horizontal scrollbar appears on the image grid area either.
