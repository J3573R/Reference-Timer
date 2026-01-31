import { dialog, app } from 'electron'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
const THUMBNAIL_SIZE = 200 // Thumbnail size in pixels

// Get or create thumbnails directory
function getThumbnailsDir(): string {
  const thumbnailsDir = path.join(app.getPath('userData'), 'thumbnails')
  if (!fs.existsSync(thumbnailsDir)) {
    fs.mkdirSync(thumbnailsDir, { recursive: true })
  }
  return thumbnailsDir
}

// Generate a hash for a file path to use as thumbnail filename
function getThumbnailPath(imagePath: string): string {
  const hash = crypto.createHash('md5').update(imagePath).digest('hex')
  return path.join(getThumbnailsDir(), `${hash}.jpg`)
}

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

export async function selectFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

export interface FolderNode {
  name: string
  path: string
  type: 'folder' | 'image'
  children?: FolderNode[]
  exists: boolean
}

// Scan folder structure for sidebar - only includes subfolders, not images
// This is fast because it doesn't recurse into every folder or count images
export function scanFolder(folderPath: string): FolderNode {
  const exists = fs.existsSync(folderPath)
  const node: FolderNode = {
    name: path.basename(folderPath),
    path: folderPath,
    type: 'folder',
    exists,
    children: [],
  }

  if (!exists) {
    return node
  }

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })

    // Only add immediate subdirectories (not recursive for performance)
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(folderPath, entry.name)
        // Don't recursively scan - just add the folder node
        // Children will be loaded on-demand when user clicks
        node.children!.push({
          name: entry.name,
          path: fullPath,
          type: 'folder',
          exists: true,
          children: [], // Empty - will be populated on expand
        })
      }
    }

    // Sort folders alphabetically
    node.children!.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error(`Error scanning folder ${folderPath}:`, error)
  }

  return node
}

// Get immediate subfolders of a folder (for lazy loading sidebar)
export function getSubfolders(folderPath: string): FolderNode[] {
  if (!fs.existsSync(folderPath)) {
    return []
  }

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => ({
        name: entry.name,
        path: path.join(folderPath, entry.name),
        type: 'folder' as const,
        exists: true,
        children: [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}

export function getImagesInFolder(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) {
    return []
  }

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    return entries
      .filter(entry => entry.isFile() && isImageFile(entry.name))
      .map(entry => path.join(folderPath, entry.name))
      .sort()
  } catch {
    return []
  }
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

// Generate a thumbnail for an image, returns the thumbnail path
export async function getThumbnail(imagePath: string): Promise<string> {
  const thumbnailPath = getThumbnailPath(imagePath)

  // Return cached thumbnail if it exists and is newer than the original
  if (fs.existsSync(thumbnailPath)) {
    try {
      const thumbStat = fs.statSync(thumbnailPath)
      const origStat = fs.statSync(imagePath)
      if (thumbStat.mtimeMs > origStat.mtimeMs) {
        return thumbnailPath
      }
    } catch {
      // If we can't stat, just regenerate
    }
  }

  try {
    await sharp(imagePath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath)

    return thumbnailPath
  } catch (error) {
    console.error(`Error generating thumbnail for ${imagePath}:`, error)
    // Return original path as fallback
    return imagePath
  }
}

// Generate thumbnails for multiple images in parallel (with concurrency limit)
export async function getThumbnails(imagePaths: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  const CONCURRENCY = 4 // Process 4 images at a time

  for (let i = 0; i < imagePaths.length; i += CONCURRENCY) {
    const batch = imagePaths.slice(i, i + CONCURRENCY)
    const thumbnails = await Promise.all(
      batch.map(async (imagePath) => {
        const thumbnail = await getThumbnail(imagePath)
        return { imagePath, thumbnail }
      })
    )
    for (const { imagePath, thumbnail } of thumbnails) {
      results.set(imagePath, thumbnail)
    }
  }

  return results
}
