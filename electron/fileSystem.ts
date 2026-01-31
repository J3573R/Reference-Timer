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

    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name)

      if (entry.isDirectory()) {
        node.children!.push(scanFolder(fullPath))
      } else if (entry.isFile() && isImageFile(entry.name)) {
        node.children!.push({
          name: entry.name,
          path: fullPath,
          type: 'image',
          exists: true,
        })
      }
      // Non-image files are silently ignored
    }

    // Sort: folders first, then images, alphabetically within each
    node.children!.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  } catch (error) {
    console.error(`Error scanning folder ${folderPath}:`, error)
  }

  return node
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
