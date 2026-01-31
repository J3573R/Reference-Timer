# Reference Timer - Design Document

A macOS desktop app for artists to practice timed drawing sessions using their own local image references.

## Overview

Electron-based app that lets users:
- Select multiple folders containing reference images
- Browse and select images or entire folders for drawing sessions
- Run timed sessions in three modes: Simple, Class, or Progressive
- Track session history and mark favorite images

## Technology

- **Electron** with web stack (HTML/CSS/JavaScript or TypeScript)
- **electron-store** or similar for persistent JSON storage
- Standard web image formats: JPG, JPEG, PNG, GIF, WebP, BMP (case-insensitive)

## Data Storage

```json
{
  "referenceFolders": [
    "/Users/example/Art/References",
    "/Users/example/Downloads/PoseBooks"
  ],
  "favorites": [
    "/Users/example/Art/References/anatomy/pose1.jpg"
  ],
  "progressivePresets": [
    {
      "name": "Gesture Practice",
      "stages": [
        { "duration": 30, "count": 5 },
        { "duration": 60, "count": 5 }
      ]
    },
    {
      "name": "Full Study",
      "stages": [
        { "duration": 60, "count": 3 },
        { "duration": 300, "count": 2 }
      ]
    }
  ],
  "sessionHistory": [
    {
      "date": "2026-01-31T14:30:00",
      "mode": "progressive",
      "preset": "Gesture Practice",
      "totalTime": 450,
      "complete": true,
      "images": [
        { "path": "/path/to/image1.jpg", "timeSpent": 30 },
        { "path": "/path/to/image2.png", "timeSpent": 60 }
      ]
    }
  ],
  "settings": {
    "audioChime": true
  }
}
```

## UI Screens

### Screen 1: Main Browser

- **Left sidebar**: Folder tree from all reference folders, "★ Favorites" virtual folder at top
- **Right area**: Thumbnail grid of images from selected folder
- **Top bar**: "Manage Folders" button, "History" button, "Start Session" button
- Click thumbnails to select individual images, or "Select All" for entire folder
- Right-click or hover-icon on image to toggle favorite

### Screen 2: Session Setup Modal

Mode selector tabs: **Simple | Class | Progressive**

**Simple mode:**
- Time per image (30s, 1m, 2m, 5m, or custom input)
- Runs through all selected images

**Class mode:**
- Time per image
- Number of images to draw
- Randomly selects from your selection

**Progressive mode:**
- Dropdown to pick saved preset OR "Custom"
- Custom: define stages manually (duration + count per stage)
- "Save as Preset" button for custom configurations

Big "Start" button to begin session.

### Screen 3: Drawing Session

- Fullscreen image display
- Minimal overlay UI:
  - Timer countdown (MM:SS or SS)
  - Current image number (e.g., "3/10")
  - Stage name if progressive mode (e.g., "Gesture - 3/5")
- Controls: pause/resume, skip next, go back
- "End Session" button (with confirmation)

**Keyboard shortcuts:**
- Space: pause/resume
- Right arrow: skip to next
- Left arrow: go back

### Screen 4: Session Complete

- Stats: total time, images completed, date/time
- "Start Another" and "Back to Browser" buttons
- Session auto-saved to history

### Screen 5: History View

- List of past sessions: date, mode, duration, image count, complete/incomplete
- Click session to expand and see all images with time spent on each
- Option to re-run a session with same images
- "Clear History" option

### Screen 6: Settings

- Manage reference folders (add/remove)
- Clean up missing favorites
- Audio chime toggle for timer transitions
- Manage progressive presets (rename/delete)
- Clear session history

## Behavior Details

### File Handling

- Only show files with extensions: .jpg, .jpeg, .png, .gif, .webp, .bmp
- Case-insensitive matching (.JPG works)
- Unsupported files silently ignored

### Missing Paths

- On launch, check if reference folders still exist
- Missing folders: show grayed out with warning icon in sidebar
- Clicking missing folder: "Folder not found. Remove from list or locate new path?"
- Missing favorites: show as broken/grayed, "Clean up missing favorites" in settings

### Timer Mechanics

- Countdown displays MM:SS (or SS for under a minute)
- Timer zero: optional audio chime, auto-advance to next image
- Pause: freezes countdown, dims image slightly

### Progressive Mode

- Stages run in order
- Images randomly selected from user's selection, distributed across stages
- If fewer images than needed, images can repeat

### Session Interruption

- "End Session" asks for confirmation
- Partial session saved to history (marked incomplete)
- History shows which images were completed

## Default Progressive Presets

1. **Gesture Practice**: 5 images at 30s, then 5 images at 60s
2. **Full Study**: 3 images at 1min, then 2 images at 5min
