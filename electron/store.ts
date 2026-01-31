interface Stage {
  duration: number
  count: number
}

interface ProgressivePreset {
  name: string
  stages: Stage[]
}

interface SessionImage {
  path: string
  timeSpent: number
}

interface Session {
  id: string
  date: string
  mode: 'simple' | 'class' | 'progressive'
  preset?: string
  totalTime: number
  complete: boolean
  images: SessionImage[]
}

interface Settings {
  audioChime: boolean
}

export interface AppData {
  referenceFolders: string[]
  favorites: string[]
  progressivePresets: ProgressivePreset[]
  sessionHistory: Session[]
  settings: Settings
}

const defaultPresets: ProgressivePreset[] = [
  {
    name: 'Gesture Practice',
    stages: [
      { duration: 30, count: 5 },
      { duration: 60, count: 5 },
    ],
  },
  {
    name: 'Full Study',
    stages: [
      { duration: 60, count: 3 },
      { duration: 300, count: 2 },
    ],
  },
]

const defaults: AppData = {
  referenceFolders: [],
  favorites: [],
  progressivePresets: defaultPresets,
  sessionHistory: [],
  settings: {
    audioChime: true,
  },
}

type StoreType = {
  get: <K extends keyof AppData>(key: K) => AppData[K]
  set: <K extends keyof AppData>(key: K, value: AppData[K]) => void
  store: AppData
}

let store: StoreType | null = null

export async function getStore(): Promise<StoreType> {
  if (store) return store

  const Store = (await import('electron-store')).default
  store = new Store<AppData>({ defaults }) as unknown as StoreType
  return store
}
