// A document as the main process stores it in SQLite. Mirrored in
// electron/database.ts, which is the source of truth.
export type DocumentRecord = {
  id: number
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

declare global {
  interface Window {
    // Exposed by electron/preload.ts
    WordApp: {
      platform: string
      // Signals that React has mounted; the main process then reveals the window.
      ready: () => void
      // Caption-button actions for the frameless window.
      windowControls: {
        close: () => void
        minimize: () => void
        toggleMaximize: () => void
        isMaximized: () => Promise<boolean>
        // Subscribes to maximize/unmaximize changes; returns an unsubscribe.
        onMaximizedChange: (
          callback: (maximized: boolean) => void,
        ) => () => void
      }
      // Documents live in the SQLite database the main process owns.
      documents: {
        // Creates a fresh untitled document and returns the stored row.
        create: () => Promise<DocumentRecord>
        // Reads one document; undefined when no such id exists.
        get: (id: number) => Promise<DocumentRecord | undefined>
        // Counts the stored documents; the home page shows the number.
        count: () => Promise<number>
      }
    }
  }
}
