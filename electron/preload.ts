import { contextBridge, ipcRenderer } from 'electron'
import { rendererReadyChannel } from './ipc.ts'

contextBridge.exposeInMainWorld('WordApp', {
  platform: process.platform,
  // Tells the main process that React has mounted, so it can show the window.
  ready: () => {
    ipcRenderer.send(rendererReadyChannel)
  },
})
