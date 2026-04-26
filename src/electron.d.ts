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
        getThumbnails: (imagePaths: string[], priority?: 'high' | 'low') => Promise<Record<string, string>>
        getCachedThumbnails: (imagePaths: string[]) => Promise<Record<string, string>>
        generateThumbnailsInBackground: (folderPaths: string[]) => Promise<void>
        pauseBackgroundThumbnails: () => Promise<void>
        resumeBackgroundThumbnails: () => Promise<void>
        onThumbnailProgress: (callback: (progress: { current: number; total: number }) => void) => void
        onThumbnailGenerated: (callback: (data: { imagePath: string; thumbnailPath: string }) => void) => void
        removeThumbnailProgressListener: () => void
        removeThumbnailGeneratedListener: () => void
      }
    }
  }
}

export {}
