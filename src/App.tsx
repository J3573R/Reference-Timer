import { useEffect, useState } from 'react'

export default function App() {
  const [folders, setFolders] = useState<string[]>([])

  useEffect(() => {
    window.electronAPI.store.get('referenceFolders').then(setFolders)
  }, [])

  const handleAddFolder = async () => {
    const folder = await window.electronAPI.fs.selectFolder()
    if (folder) {
      const newFolders = [...folders, folder]
      await window.electronAPI.store.set('referenceFolders', newFolders)
      setFolders(newFolders)
    }
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>Reference Timer</h1>
      <button onClick={handleAddFolder}>Add Folder</button>
      <ul>
        {folders.map(f => <li key={f}>{f}</li>)}
      </ul>
    </div>
  )
}
