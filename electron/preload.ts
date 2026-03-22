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
    getThumbnails: (imagePaths: string[], priority: 'high' | 'low' = 'high') =>
      ipcRenderer.invoke('fs:getThumbnails', imagePaths, priority),
    generateThumbnailsInBackground: (folderPaths: string[]) =>
      ipcRenderer.invoke('fs:generateThumbnailsInBackground', folderPaths),
    pauseBackgroundThumbnails: () => ipcRenderer.invoke('fs:pauseBackgroundThumbnails'),
    resumeBackgroundThumbnails: () => ipcRenderer.invoke('fs:resumeBackgroundThumbnails'),
    onThumbnailProgress: (callback: (progress: { current: number; total: number }) => void) => {
      ipcRenderer.on('thumbnail-progress', (_event, progress) => callback(progress))
    },
    onThumbnailGenerated: (callback: (data: { imagePath: string; thumbnailPath: string }) => void) => {
      ipcRenderer.on('thumbnail-generated', (_event, data) => callback(data))
    },
    removeThumbnailProgressListener: () => {
      ipcRenderer.removeAllListeners('thumbnail-progress')
    },
    removeThumbnailGeneratedListener: () => {
      ipcRenderer.removeAllListeners('thumbnail-generated')
    },
  },
})
