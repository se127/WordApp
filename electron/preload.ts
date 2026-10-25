import { contextBridge, ipcRenderer } from 'electron'
import type { ClipboardContent, ClipboardWritePayload } from './clipboard.ts'
import type {
  DocumentChanges,
  DocumentListOptions,
  DocumentRecord,
} from './database.ts'
import {
  appBeforeCloseChannel,
  appClipboardReadChannel,
  appClipboardWriteChannel,
  appCloseCancelledChannel,
  appCloseReadyChannel,
  documentsCancelChannel,
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsDeleteManyChannel,
  documentsGetChannel,
  documentsListChannel,
  documentsSaveChannel,
  imagesCollectChannel,
  imagesCopyChannel,
  imagesSaveChannel,
} from './ipc.ts'
import type {
  ImageCollectRequest,
  ImageSaveRequest,
  ImageSourceRequest,
  SavedImage,
} from './images.ts'

contextBridge.exposeInMainWorld('WordApp', {
  platform: process.platform,
  clipboard: {
    read: (): Promise<ClipboardContent | null> =>
      ipcRenderer.invoke(appClipboardReadChannel),
    write: (payload: ClipboardWritePayload): Promise<void> =>
      ipcRenderer.invoke(appClipboardWriteChannel, payload),
  },
  lifecycle: {
    onBeforeClose: (listener: () => void): (() => void) => {
      const handler = (): void => listener()
      ipcRenderer.on(appBeforeCloseChannel, handler)
      return () => {
        ipcRenderer.removeListener(appBeforeCloseChannel, handler)
      }
    },
    closeReady: (): void => {
      ipcRenderer.send(appCloseReadyChannel)
    },
    closeCancelled: (): void => {
      ipcRenderer.send(appCloseCancelledChannel)
    },
  },
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
  images: {
    save: (request: ImageSaveRequest): Promise<SavedImage> =>
      ipcRenderer.invoke(imagesSaveChannel, request),
    copy: (request: ImageSourceRequest): Promise<SavedImage> =>
      ipcRenderer.invoke(imagesCopyChannel, request),
    collect: (request: ImageCollectRequest): Promise<void> =>
      ipcRenderer.invoke(imagesCollectChannel, request),
  },
})
