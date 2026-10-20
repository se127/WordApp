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
}

declare global {
  interface Window {
    WordApp: {
      platform: string
      documents: {
        create: () => Promise<DocumentRecord>
        get: (id: number) => Promise<DocumentRecord | undefined>
        count: () => Promise<number>
        list: (options: DocumentListOptions) => Promise<DocumentRecord[]>
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
