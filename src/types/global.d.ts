// A document as the main process stores it in SQLite. Mirrored in
// electron/database.ts, which is the source of truth.
export type DocumentRecord = {
  id: number
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

// The changes one save may carry: any subset of the editable fields, so the
// title edit and the future body edit go through the same save. Mirrored in
// electron/database.ts, which is the source of truth.
export type DocumentChanges = {
  title?: string
  body?: string
}

declare global {
  interface Window {
    // Exposed by electron/preload.ts
    WordApp: {
      platform: string
      // Documents live in the SQLite database the main process owns.
      documents: {
        // Creates a fresh untitled document and returns the stored row.
        create: () => Promise<DocumentRecord>
        // Reads one document; undefined when no such id exists.
        get: (id: number) => Promise<DocumentRecord | undefined>
        // Counts the stored documents; the home page shows the number.
        count: () => Promise<number>
        // Deletes one document; deleting a missing id does nothing.
        delete: (id: number) => Promise<void>
        // Saves changes to one document and returns the stored row;
        // undefined when no such id exists.
        save: (
          id: number,
          changes: DocumentChanges,
        ) => Promise<DocumentRecord | undefined>
      }
    }
  }
}
