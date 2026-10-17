import { contextBridge, ipcRenderer } from 'electron'
import type { DocumentChanges, DocumentRecord } from './database.ts'
import {
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsGetChannel,
  documentsListChannel,
  documentsSaveChannel,
} from './ipc.ts'

contextBridge.exposeInMainWorld('WordApp', {
  platform: process.platform,
  documents: {
    create: (): Promise<DocumentRecord> =>
      ipcRenderer.invoke(documentsCreateChannel),
    get: (id: number): Promise<DocumentRecord | undefined> =>
      ipcRenderer.invoke(documentsGetChannel, id),
    count: (): Promise<number> => ipcRenderer.invoke(documentsCountChannel),
    list: (): Promise<DocumentRecord[]> =>
      ipcRenderer.invoke(documentsListChannel),
    delete: (id: number): Promise<void> =>
      ipcRenderer.invoke(documentsDeleteChannel, id),
    save: (
      id: number,
      changes: DocumentChanges,
    ): Promise<DocumentRecord | undefined> =>
      ipcRenderer.invoke(documentsSaveChannel, id, changes),
  },
})
