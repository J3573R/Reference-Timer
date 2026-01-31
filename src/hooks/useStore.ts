import { useState, useEffect, useCallback } from 'react'
import type { AppData } from '../types'

export function useStore<K extends keyof AppData>(key: K) {
  const [value, setValue] = useState<AppData[K] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI.store.get(key).then(v => {
      setValue(v)
      setLoading(false)
    })
  }, [key])

  const update = useCallback(async (newValue: AppData[K]) => {
    await window.electronAPI.store.set(key, newValue)
    setValue(newValue)
  }, [key])

  return { value, loading, update }
}
