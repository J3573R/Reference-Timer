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
        getImagesInFolder: (folderPath: string) => Promise<string[]>
        fileExists: (filePath: string) => Promise<boolean>
      }
    }
  }
}

export {}
