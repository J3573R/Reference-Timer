import { useEffect, useState } from 'react'

export default function App() {
  const [folders, setFolders] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.store.get('referenceFolders').then(setFolders)
  }, [])

  return (
    <div style={{ padding: '20px' }}>
      <h1>Reference Timer</h1>
      <p>Reference folders: {folders.length}</p>
    </div>
  )
}
