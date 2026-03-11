# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Reference Timer is a macOS Electron desktop app for timed drawing reference practice. Built with Electron + React + TypeScript + Vite.

## Commands

- `npm run dev` — Start development (Vite dev server + Electron concurrently)
- `npm run build` — Production build (TypeScript compile + Vite bundle)
- `npm run package` — Build and package as macOS DMG

No test or lint commands are configured.

## Architecture

**Two-process Electron model** with strict context isolation (`nodeIntegration: false`):

- **Main process** (`electron/`) — Window management, IPC handlers, file system ops, thumbnail generation (Sharp), persistent storage (electron-store)
- **Renderer process** (`src/`) — React UI with centralized state in `App.tsx`
- **Shared types** (`shared/types.ts`) — Core data types used by both processes
- **Preload bridge** (`electron/preload.ts`) — Exposes `window.electronAPI` with `store.*` and `fs.*` methods

### State Management

All app state lives in `App.tsx` via React hooks (no external state library). State syncs to electron-store for persistence. Key state: `referenceFolders`, `selectedImages` (Set for multi-folder support), `presets`, `activeSession`, `sessionHistory`.

### Component Hierarchy

`App.tsx` is the container. Children: `TopBar`, `Sidebar` (lazy-loaded folder tree), `ImageGrid` (virtualized via react-window), `SessionModal` (config), `SessionView` (active timer), `HistoryView`, `SettingsModal`.

### Session Flow

User selects images → configures session in `SessionModal` (simple/class/progressive mode) → `SessionView` runs timer with shuffled image queue → completion saves to history.

### Custom Hooks

- `useTimer` — Countdown timer with pause/resume, auto-start behavior
- `useStore` — Async wrapper for electron-store access

### Build Configuration

- Two TypeScript configs: `tsconfig.json` (renderer, bundler resolution) and `tsconfig.electron.json` (main process, Node16/CommonJS)
- Vite output: `dist/` (renderer), `dist-electron/` (main process)
- Path alias: `@` → `./src`
- Thumbnails cached at `~/Library/Application Support/reference-timer/thumbnails/`

### Styling

Single CSS file (`src/styles/main.css`) with CSS variables. Dark theme, Indigo accent (`#6366f1`), system fonts.
