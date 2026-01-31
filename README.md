# Reference Timer

A macOS desktop application for timed drawing reference practice, similar to [Proko's Gesture Drawing Tool](https://www.proko.com/gesture-drawing-tool/). Built with Electron, React, and TypeScript.

## Features

### Image Management

- **Folder-based organization** - Add reference folders and browse nested subfolders in a tree view
- **Multi-folder selection** - Select images from different folders to build your practice session
- **Favorites** - Mark images as favorites for quick access
- **Fast thumbnails** - Automatic thumbnail generation with caching for smooth browsing of large collections (400+ images)
- **Background processing** - Thumbnails generate in the background on app launch

### Image Preview

- **Full-screen preview** - Click any image to view it full-size
- **Zoom and pan** - Mouse wheel to zoom, drag to pan when zoomed in
- **Keyboard navigation** - Arrow keys to browse, +/- to zoom, Escape to close
- **Quick browsing** - Navigate through images without leaving preview mode

### Practice Sessions

- **Fixed time mode** - Set a specific duration per image (e.g., 30 seconds, 2 minutes)
- **Progressive mode** - Create presets with varying times (e.g., 30s warmups, then 2min studies)
- **Audio chime** - Optional sound notification when time is up
- **Session history** - Track your practice sessions and re-run previous ones

## Screenshots

The app features a dark theme with a sidebar for folder navigation and a grid view for browsing images.

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/reference-timer.git
cd reference-timer

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
# Build the app
npm run build

# Package as macOS app
npm run package
```

## Usage

1. **Add reference folders** - Click "Add Reference Folder" or go to Settings to add folders containing your reference images
2. **Browse images** - Navigate through folders in the sidebar, click images to preview
3. **Select images** - Click the checkbox on images you want to include in your session
4. **Start session** - Click "Start Session" and configure your timer settings
5. **Practice!** - Draw along with each image as the timer counts down

### Keyboard Shortcuts

#### In Preview Mode

| Key | Action |
|-----|--------|
| `Esc` | Close preview |
| `Left/Right Arrow` | Previous/Next image |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset zoom |

#### In Session Mode

| Key | Action |
|-----|--------|
| `Space` | Pause/Resume timer |
| `Left Arrow` | Previous image |
| `Right Arrow` | Next image |

## Tech Stack

- **Electron** - Cross-platform desktop app framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Fast build tool
- **Sharp** - High-performance image processing for thumbnails
- **electron-store** - Persistent JSON storage for settings

## Project Structure

```
reference-timer/
├── electron/           # Electron main process
│   ├── main.ts        # App entry point, window management
│   ├── preload.ts     # Context bridge for IPC
│   ├── fileSystem.ts  # File operations, thumbnail generation
│   └── store.ts       # Persistent storage
├── src/               # React renderer process
│   ├── components/    # React components
│   ├── hooks/         # Custom React hooks
│   ├── styles/        # CSS styles
│   └── App.tsx        # Main app component
└── dist/              # Built output
```

## Configuration

Settings are stored in the app's user data directory:

- **macOS**: `~/Library/Application Support/reference-timer/`

Stored data includes:

- Reference folder paths
- Favorite images
- Progressive timer presets
- Session history
- App settings (audio chime, etc.)

## License

ISC

## Acknowledgments

Inspired by [Proko's Gesture Drawing Tool](https://www.proko.com/gesture-drawing-tool/) and similar artist practice tools.
