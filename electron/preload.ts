import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  DocumentChanges,
  DocumentListOptions,
  DocumentListPage,
  DocumentRecord,
} from './database.ts'
import {
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsDeleteManyChannel,
  documentsGetChannel,
  documentsListChannel,
  documentsSaveChannel,
  windowCloseChannel,
  windowIsMaximizedChannel,
  windowMaximizedChangedChannel,
  windowMinimizeChannel,
  windowToggleMaximizeChannel,
} from './ipc.ts'

contextBridge.exposeInMainWorld('WordApp', {
  platform: process.platform,
  documents: {
    create: (): Promise<DocumentRecord> =>
      ipcRenderer.invoke(documentsCreateChannel),
    get: (id: number): Promise<DocumentRecord | undefined> =>
      ipcRenderer.invoke(documentsGetChannel, id),
    count: (): Promise<number> => ipcRenderer.invoke(documentsCountChannel),
    list: (options: DocumentListOptions): Promise<DocumentListPage> =>
      ipcRenderer.invoke(documentsListChannel, options),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke(documentsDeleteChannel, id),
    deleteMany: (ids: number[]): Promise<void> =>
      ipcRenderer.invoke(documentsDeleteManyChannel, ids),
    save: (
      id: number,
      changes: DocumentChanges,
    ): Promise<DocumentRecord | undefined> =>
      ipcRenderer.invoke(documentsSaveChannel, id, changes),
  },
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke(windowMinimizeChannel),
    toggleMaximize: (): Promise<void> =>
      ipcRenderer.invoke(windowToggleMaximizeChannel),
    close: (): Promise<void> => ipcRenderer.invoke(windowCloseChannel),
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke(windowIsMaximizedChannel),
    onMaximizedChange: (
      callback: (isMaximized: boolean) => void,
    ): (() => void) => {
      const listener = (
        _event: IpcRendererEvent,
        isMaximized: boolean,
      ): void => {
        callback(isMaximized)
      }
      ipcRenderer.on(windowMaximizedChangedChannel, listener)

      return () => {
        ipcRenderer.removeListener(windowMaximizedChangedChannel, listener)
      }
    },
  },
})
