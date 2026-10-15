export {}

declare global {
  interface Window {
    // Exposed by electron/preload.ts
    WordApp: {
      platform: string
      // Signals that React has mounted; the main process then reveals the window.
      ready: () => void
    }
  }
}
