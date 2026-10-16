// IPC channel names shared between the Electron main and preload bundles.
export const rendererReadyChannel = 'wordapp:ready'

// Caption buttons of the frameless window.
export const windowCloseChannel = 'wordapp:window:close'
export const windowMinimizeChannel = 'wordapp:window:minimize'
export const windowToggleMaximizeChannel = 'wordapp:window:toggle-maximize'

// Maximized state: queried once on mount and pushed on every change.
export const windowIsMaximizedChannel = 'wordapp:window:is-maximized'
export const windowMaximizedChangedChannel = 'wordapp:window:maximized-changed'
