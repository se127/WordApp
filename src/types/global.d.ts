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

declare global {
  interface Window {
    WordApp: {
      platform: string
      documents: {
        create: () => Promise<DocumentRecord>
        get: (id: number) => Promise<DocumentRecord | undefined>
        count: () => Promise<number>
        delete: (id: number) => Promise<void>
        save: (
          id: number,
          changes: DocumentChanges,
        ) => Promise<DocumentRecord | undefined>
      }
    }
  }
}
