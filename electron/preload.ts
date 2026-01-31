import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Will add IPC methods here
})
