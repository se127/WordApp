export {}

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
    }
  }
}
