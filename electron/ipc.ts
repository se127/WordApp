// IPC channel names shared between the Electron main and preload bundles.

// Caption buttons of the frameless window.
export const windowCloseChannel = 'wordapp:window:close'
export const windowMinimizeChannel = 'wordapp:window:minimize'
export const windowToggleMaximizeChannel = 'wordapp:window:toggle-maximize'

// Maximized state: queried once on mount and pushed on every change.
export const windowIsMaximizedChannel = 'wordapp:window:is-maximized'
export const windowMaximizedChangedChannel = 'wordapp:window:maximized-changed'

// Documents: the renderer asks the main process — the only SQLite owner — to
// create rows, read them back, and count them. The count is its own query,
// so listing pages never fetch every row just to count.
export const documentsCreateChannel = 'wordapp:documents:create'
export const documentsGetChannel = 'wordapp:documents:get'
export const documentsCountChannel = 'wordapp:documents:count'
