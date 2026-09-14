const { contextBridge, ipcRenderer } = require('electron')

let beforeClose
ipcRenderer.on('window:prepare-close', () => {
  Promise.resolve()
    .then(() => (beforeClose ? beforeClose() : true))
    .then((saved) => ipcRenderer.send('window:close-ready', saved === true))
    .catch(() => ipcRenderer.send('window:close-ready', false))
})

contextBridge.exposeInMainWorld('scripyDesktop', {
  platform: process.platform,
  setAppearance: (preference) => ipcRenderer.invoke('appearance:set', preference),
  getFullscreen: () => ipcRenderer.invoke('window:get-fullscreen'),
  setFullscreen: (fullscreen) => ipcRenderer.invoke('window:set-fullscreen', fullscreen),
  onFullscreenChange: (callback) => {
    const listener = (_event, fullscreen) => callback(fullscreen === true)
    ipcRenderer.on('window:fullscreen-changed', listener)
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener)
  },
  openDocument: () => ipcRenderer.invoke('document:open'),
  bindDocument: (token, id) => ipcRenderer.invoke('document:bind', token, id),
  getLocation: (id) => ipcRenderer.invoke('document:location', id),
  reopenDocument: (id) => ipcRenderer.invoke('document:reopen', id),
  takeOpenRequest: () => ipcRenderer.invoke('document:pending-open'),
  onOpenRequest: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('document:open-request', listener)
    return () => ipcRenderer.removeListener('document:open-request', listener)
  },
  revealDocument: (id) => ipcRenderer.invoke('document:reveal', id),
  saveDocument: (content, suggestedName, saveAs = false) =>
    ipcRenderer.invoke('document:save', content, suggestedName, saveAs),
  autosave: (content) => ipcRenderer.invoke('document:autosave', content),
  exportFile: (bytes, suggestedName, extension) =>
    ipcRenderer.invoke('document:export', bytes, suggestedName, extension),
  onBeforeClose: (callback) => {
    beforeClose = callback
    return () => {
      beforeClose = undefined
    }
  },
})
