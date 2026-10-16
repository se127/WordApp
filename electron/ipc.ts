// IPC channel names shared between the Electron main and preload bundles.

// Documents: the renderer asks the main process — the only SQLite owner — to
// create rows, read them back, and count them. The count is its own query,
// so listing pages never fetch every row just to count.
export const documentsCreateChannel = 'wordapp:documents:create'
export const documentsGetChannel = 'wordapp:documents:get'
export const documentsCountChannel = 'wordapp:documents:count'
