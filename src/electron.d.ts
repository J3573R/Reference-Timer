import type { AppData } from './types'

export interface FolderNode {
  name: string
  path: string
  type: 'folder' | 'image'
  children?: FolderNode[]
  exists: boolean
}

declare global {
  interface Window {
    electronAPI: {
      store: {
        get: <K extends keyof AppData>(key: K) => Promise<AppData[K]>
        set: <K extends keyof AppData>(key: K, value: AppData[K]) => Promise<void>
        getAll: () => Promise<AppData>
      }
      fs: {
        selectFolder: () => Promise<string | null>
        scanFolder: (folderPath: string) => Promise<FolderNode>
        getSubfolders: (folderPath: string) => Promise<FolderNode[]>
        getImagesInFolder: (folderPath: string) => Promise<string[]>
        fileExists: (filePath: string) => Promise<boolean>
        getThumbnail: (imagePath: string) => Promise<string>
        getThumbnails: (imagePaths: string[]) => Promise<Record<string, string>>
        generateThumbnailsInBackground: (folderPaths: string[]) => Promise<void>
        onThumbnailProgress: (callback: (progress: { current: number; total: number }) => void) => void
        removeThumbnailProgressListener: () => void
      }
    }
  }
}

export {}
