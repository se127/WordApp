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

export type DocumentListCursor = {
  createdAt: number
  id: number
}

export type DocumentListOptions = {
  cursor: DocumentListCursor | null
  limit: number
}

export type DocumentListPage = {
  documents: DocumentRecord[]
  nextCursor: DocumentListCursor | null
}

export type WindowControls = {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    WordApp: {
      platform: string
      documents: {
        create: () => Promise<DocumentRecord>
        get: (id: number) => Promise<DocumentRecord | undefined>
        count: () => Promise<number>
        list: (options: DocumentListOptions) => Promise<DocumentListPage>
        delete: (id: number) => Promise<void>
        deleteMany: (ids: number[]) => Promise<void>
        save: (
          id: number,
          changes: DocumentChanges,
        ) => Promise<DocumentRecord | undefined>
      }
      windowControls: WindowControls
    }
  }
}
