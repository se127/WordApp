import { contextBridge, ipcRenderer } from 'electron'
import type {
  DocumentChanges,
  DocumentListOptions,
  DocumentRecord,
} from './database.ts'
import {
  documentsCancelChannel,
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsDeleteManyChannel,
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
    count: (search: string | undefined, requestId: string): Promise<number> =>
      ipcRenderer.invoke(documentsCountChannel, {
        requestId,
        payload: search,
      }),
    list: (
      options: DocumentListOptions,
      requestId: string,
    ): Promise<DocumentRecord[]> =>
      ipcRenderer.invoke(documentsListChannel, {
        requestId,
        payload: options,
      }),
    cancel: (requestId: string): void => {
      ipcRenderer.send(documentsCancelChannel, requestId)
    },
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
})
