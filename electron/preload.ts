import { contextBridge, ipcRenderer } from 'electron'
import {
  rendererReadyChannel,
  windowCloseChannel,
  windowIsMaximizedChannel,
  windowMaximizedChangedChannel,
  windowMinimizeChannel,
  windowToggleMaximizeChannel,
} from './ipc.ts'

contextBridge.exposeInMainWorld('WordApp', {
  platform: process.platform,
  // Tells the main process that React has mounted, so it can show the window.
  ready: () => {
    ipcRenderer.send(rendererReadyChannel)
  },
  // Caption buttons for the frameless window's drag zone.
  windowControls: {
    close: () => {
      ipcRenderer.send(windowCloseChannel)
    },
    minimize: () => {
      ipcRenderer.send(windowMinimizeChannel)
    },
    toggleMaximize: () => {
      ipcRenderer.send(windowToggleMaximizeChannel)
    },
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke(windowIsMaximizedChannel),
    // Subscribes to real maximize/unmaximize changes; returns an unsubscribe.
    onMaximizedChange: (
      callback: (maximized: boolean) => void,
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        maximized: boolean,
      ) => {
        callback(maximized)
      }
      ipcRenderer.on(windowMaximizedChangedChannel, listener)
      return () => {
        ipcRenderer.removeListener(windowMaximizedChangedChannel, listener)
      }
    },
  },
})
