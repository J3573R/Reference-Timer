import type { AppData } from './types'

declare global {
  interface Window {
    electronAPI: {
      store: {
        get: <K extends keyof AppData>(key: K) => Promise<AppData[K]>
        set: <K extends keyof AppData>(key: K, value: AppData[K]) => Promise<void>
        getAll: () => Promise<AppData>
      }
    }
  }
}

export {}
