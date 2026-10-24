export type DocumentRecord = {
  id: number
  title: string | null
  body: string
  createdAt: number
  updatedAt: number
}

export type DocumentChanges = {
  title?: string | null
  body?: string
}

export type DocumentListOrder = 'newest' | 'oldest'

export type DocumentListOptions = {
  offset: number
  limit: number
  order?: DocumentListOrder
  search?: string
}

export type ImageSaveRequest = {
  documentId: number
  name: string
  type: string
  data: ArrayBuffer
}

export type ImageSourceRequest = {
  documentId: number
  src: string
}

export type ImageCollectRequest = {
  documentId: number
  savedBody: string
  currentBody: string
}

export type SavedImage = {
  src: string
}

declare global {
  interface Window {
    WordApp: {
      platform: string
      lifecycle: {
        onBeforeClose: (listener: () => void) => () => void
        closeReady: () => void
        closeCancelled: () => void
      }
      documents: {
        create: () => Promise<DocumentRecord>
        get: (id: number) => Promise<DocumentRecord | undefined>
        count: (
          search: string | undefined,
          requestId: string,
        ) => Promise<number>
        list: (
          options: DocumentListOptions,
          requestId: string,
        ) => Promise<DocumentRecord[]>
        cancel: (requestId: string) => void
        delete: (id: number) => Promise<void>
        deleteMany: (ids: number[]) => Promise<void>
        save: (
          id: number,
          changes: DocumentChanges,
        ) => Promise<DocumentRecord | undefined>
      }
      images: {
        save: (request: ImageSaveRequest) => Promise<SavedImage>
        copy: (request: ImageSourceRequest) => Promise<SavedImage>
        collect: (request: ImageCollectRequest) => Promise<void>
      }
    }
  }
}
