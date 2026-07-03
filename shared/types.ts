export interface Stage {
  duration: number  // seconds
  count: number
}

export interface ProgressivePreset {
  name: string
  stages: Stage[]
}

export interface SessionImage {
  path: string
  timeSpent: number  // seconds
}

export interface Session {
  id: string
  date: string  // ISO string
  mode: 'simple' | 'class' | 'progressive' | 'quickstart'
  preset?: string
  totalTime: number  // seconds
  complete: boolean
  images: SessionImage[]
}

export interface Settings {
  audioChime: boolean
}

export interface ViewedImage {
  path: string
  date: string  // ISO string
}

export interface AppData {
  referenceFolders: string[]
  favorites: string[]
  progressivePresets: ProgressivePreset[]
  sessionHistory: Session[]
  viewingHistory: ViewedImage[]
  settings: Settings
  thumbnailCache: Record<string, string>
}
