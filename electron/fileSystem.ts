import { dialog } from 'electron'
import fs from 'fs'
import path from 'path'

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']

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
