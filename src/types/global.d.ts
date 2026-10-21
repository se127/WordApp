export type DocumentRecord = {
  id: number
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

export type DocumentChanges = {
  title?: string
  body?: string
}

export type DocumentListOrder = 'newest' | 'oldest'

export type DocumentListOptions = {
  offset: number
  limit: number
  order?: DocumentListOrder
  search?: string
}

declare global {
  interface Window {
    WordApp: {
      platform: string
      lifecycle: {
        onBeforeClose: (listener: () => void) => () => void
        closeReady: () => void
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
    }
  }
}
