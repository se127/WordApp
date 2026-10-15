export {}

declare global {
  interface Window {
    // Exposed by electron/preload.ts
    WordApp: {
      platform: string
    }
  }
}
