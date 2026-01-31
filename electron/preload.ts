import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),
    getAll: () => ipcRenderer.invoke('store:getAll'),
  },
  fs: {
    selectFolder: () => ipcRenderer.invoke('fs:selectFolder'),
    scanFolder: (folderPath: string) => ipcRenderer.invoke('fs:scanFolder', folderPath),
    getSubfolders: (folderPath: string) => ipcRenderer.invoke('fs:getSubfolders', folderPath),
    getImagesInFolder: (folderPath: string) => ipcRenderer.invoke('fs:getImagesInFolder', folderPath),
    fileExists: (filePath: string) => ipcRenderer.invoke('fs:fileExists', filePath),
  },
})
