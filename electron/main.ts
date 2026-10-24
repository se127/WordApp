import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
} from 'electron'
import type { IpcMainEvent } from 'electron'
import path from 'node:path'
import {
  openDatabase,
  parseDbDelayArgument,
  parseDbFailureArgument,
  parseSeedArgument,
  resetDatabase,
} from './database.ts'
import type {
  DatabaseOperationName,
  DocumentChanges,
  DocumentListOptions,
  WordAppDatabase,
} from './database.ts'
import {
  handleImageProtocol,
  registerImageSchemePrivileges,
} from './image-protocol.ts'
import { createImageStore } from './image-store.ts'
import {
  clearImageStore,
  imageDirectoryPath,
  isImageCollectRequest,
  isImageSaveRequest,
  isImageSourceRequest,
} from './images.ts'
import {
  appBeforeCloseChannel,
  appCloseCancelledChannel,
  appCloseReadyChannel,
  documentsCancelChannel,
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsDeleteManyChannel,
  documentsGetChannel,
  documentsListChannel,
  documentsSaveChannel,
  imagesCollectChannel,
  imagesCopyChannel,
  imagesSaveChannel,
} from './ipc.ts'

registerImageSchemePrivileges()

const appRoot = app.getAppPath()

const devServerUrl = app.isPackaged
  ? undefined
  : process.env.VITE_DEV_SERVER_URL

const devSeed = app.isPackaged ? undefined : process.env.DEV_SEED

const devDbDelay = app.isPackaged ? undefined : process.env.DEV_DB_DELAY

const devDbFailures = app.isPackaged ? undefined : process.env.DEV_DB_FAILURE

const revealedWindows = new WeakSet<BrowserWindow>()
const windowsPendingClose = new WeakSet<BrowserWindow>()
const windowSaveCounts = new WeakMap<BrowserWindow, number>()

function syncWindowClosable(browserWindow: BrowserWindow): void {
  if (browserWindow.isDestroyed()) {
    return
  }

  browserWindow.setClosable(
    !windowsPendingClose.has(browserWindow) &&
      (windowSaveCounts.get(browserWindow) ?? 0) === 0,
  )
}

function beginWindowSave(browserWindow: BrowserWindow | null): void {
  if (browserWindow === null) {
    return
  }

  windowSaveCounts.set(
    browserWindow,
    (windowSaveCounts.get(browserWindow) ?? 0) + 1,
  )
  syncWindowClosable(browserWindow)
}

function endWindowSave(browserWindow: BrowserWindow | null): void {
  if (browserWindow === null) {
    return
  }

  const remainingSaves = (windowSaveCounts.get(browserWindow) ?? 1) - 1
  if (remainingSaves > 0) {
    windowSaveCounts.set(browserWindow, remainingSaves)
  } else {
    windowSaveCounts.delete(browserWindow)
  }

  syncWindowClosable(browserWindow)
}

function revealWindow(browserWindow: BrowserWindow): void {
  if (browserWindow.isDestroyed() || revealedWindows.has(browserWindow)) {
    return
  }
  revealedWindows.add(browserWindow)

  browserWindow.maximize()
  browserWindow.show()
}

const errNetworkChanged = -106
const maxLoadAttempts = 5
const closeHandshakeGraceMs = 5000

function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

function isSameAppPage(currentUrl: string, nextUrl: string): boolean {
  try {
    const current = new URL(currentUrl)
    const next = new URL(nextUrl)
    return current.origin === next.origin && current.pathname === next.pathname
  } catch {
    return false
  }
}

function createWindow(closeTimeoutMs: number): void {
  const mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: !app.isPackaged,
      preload: path.join(appRoot, 'dist-electron', 'preload.cjs'),
    },
  })

  let isClosing = false
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const closeWindow = (): void => {
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer)
      closeTimer = undefined
    }

    if (mainWindow.isDestroyed()) {
      return
    }

    isClosing = true
    windowsPendingClose.delete(mainWindow)
    windowSaveCounts.delete(mainWindow)
    mainWindow.setClosable(true)
    mainWindow.close()
  }

  const handleCloseReady = (event: IpcMainEvent): void => {
    if (
      isClosing ||
      event.sender !== mainWindow.webContents ||
      !windowsPendingClose.has(mainWindow)
    ) {
      return
    }

    closeWindow()
  }

  const handleCloseCancelled = (event: IpcMainEvent): void => {
    if (
      isClosing ||
      event.sender !== mainWindow.webContents ||
      !windowsPendingClose.has(mainWindow)
    ) {
      return
    }

    windowsPendingClose.delete(mainWindow)
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer)
      closeTimer = undefined
    }
    syncWindowClosable(mainWindow)
  }

  mainWindow.on('close', (event) => {
    if (isClosing || !revealedWindows.has(mainWindow)) {
      return
    }

    event.preventDefault()
    if (windowsPendingClose.has(mainWindow)) {
      return
    }

    windowsPendingClose.add(mainWindow)
    syncWindowClosable(mainWindow)
    try {
      mainWindow.webContents.send(appBeforeCloseChannel)
    } catch {
      closeWindow()
      return
    }
    closeTimer = setTimeout(closeWindow, closeTimeoutMs)
  })

  ipcMain.on(appCloseReadyChannel, handleCloseReady)
  ipcMain.on(appCloseCancelledChannel, handleCloseCancelled)

  mainWindow.on('closed', () => {
    if (closeTimer !== undefined) {
      clearTimeout(closeTimer)
      closeTimer = undefined
    }
    ipcMain.removeListener(appCloseReadyChannel, handleCloseReady)
    ipcMain.removeListener(appCloseCancelledChannel, handleCloseCancelled)
  })

  mainWindow.once('ready-to-show', () => {
    revealWindow(mainWindow)
  })

  const loadPage = (): void => {
    if (mainWindow.isDestroyed()) {
      return
    }

    if (devServerUrl) {
      void mainWindow.loadURL(devServerUrl)
    } else {
      void mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'))
    }
  }

  let loadAttempts = 0

  mainWindow.webContents.on('did-finish-load', () => {
    loadAttempts = 0
  })
  mainWindow.webContents.on('render-process-gone', () => {
    revealWindow(mainWindow)
  })

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.isAutoRepeat) {
        return
      }

      const webContents = mainWindow.webContents
      const matchesKey = (code: string, key: string): boolean =>
        input.code === code || input.key.toLowerCase() === key

      if (
        input.key === 'F11' &&
        !input.control &&
        !input.shift &&
        !input.alt &&
        !input.meta
      ) {
        event.preventDefault()
        mainWindow.setFullScreen(!mainWindow.isFullScreen())
        return
      }

      if (!input.control || input.alt || input.meta) {
        return
      }

      if (input.shift && matchesKey('KeyI', 'i')) {
        event.preventDefault()
        webContents.toggleDevTools()
        return
      }

      if (matchesKey('KeyR', 'r')) {
        event.preventDefault()
        if (input.shift) {
          webContents.reloadIgnoringCache()
        } else {
          webContents.reload()
        }
        return
      }

      if (
        !input.shift &&
        (input.code === 'Digit0' ||
          input.code === 'Numpad0' ||
          input.key === '0')
      ) {
        event.preventDefault()
        webContents.setZoomLevel(0)
        return
      }

      if (
        input.code === 'NumpadAdd' ||
        input.key === '+' ||
        input.code === 'Equal'
      ) {
        event.preventDefault()
        webContents.setZoomLevel(webContents.getZoomLevel() + 0.5)
        return
      }

      if (
        input.code === 'NumpadSubtract' ||
        (!input.shift && (input.code === 'Minus' || input.key === '-'))
      ) {
        event.preventDefault()
        webContents.setZoomLevel(webContents.getZoomLevel() - 0.5)
      }
    })
  }

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
      if (!isMainFrame) {
        return
      }

      if (errorCode === errNetworkChanged && loadAttempts < maxLoadAttempts) {
        loadAttempts += 1
        setTimeout(loadPage, 500)
        return
      }

      revealWindow(mainWindow)
    },
  )

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isSameAppPage(mainWindow.webContents.getURL(), url)) {
      return
    }

    event.preventDefault()
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  loadPage()
}

function isDocumentChanges(value: unknown): value is DocumentChanges {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { title, body } = value as { title?: unknown; body?: unknown }
  return (
    (title === undefined || title === null || typeof title === 'string') &&
    (body === undefined || typeof body === 'string')
  )
}

function isDocumentIds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === 'number' && Number.isSafeInteger(id))
  )
}

function isDocumentListOptions(value: unknown): value is DocumentListOptions {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { offset, limit, order, search } = value as {
    offset?: unknown
    limit?: unknown
    order?: unknown
    search?: unknown
  }
  return (
    typeof offset === 'number' &&
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    typeof limit === 'number' &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    (order === undefined || order === 'newest' || order === 'oldest') &&
    (search === undefined || typeof search === 'string')
  )
}

function isDocumentRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

type DocumentRequest = {
  requestId: string
  payload: unknown
}

function isDocumentRequest(value: unknown): value is DocumentRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { requestId } = value as { requestId?: unknown }
  return isDocumentRequestId(requestId)
}

async function startApp(): Promise<void> {
  await app.whenReady()

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.wordapp.app')
  }

  Menu.setApplicationMenu(null)

  try {
    await session.defaultSession.setProxy({
      mode: 'system',
      proxyBypassRules: '<local>',
    })
  } catch (error) {
    console.error(
      `The system proxy could not be configured: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const databasePath = app.isPackaged
    ? path.join(app.getPath('userData'), 'db.sqlite')
    : path.join(app.getAppPath(), 'dev-data', 'db.sqlite')

  const imagesDirectory = imageDirectoryPath(
    app.getAppPath(),
    app.getPath('userData'),
    app.isPackaged,
  )

  if (devSeed !== undefined) {
    try {
      resetDatabase(databasePath, parseSeedArgument(devSeed))
    } catch (error) {
      console.error(
        `The dev seed could not be applied: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      app.exit(1)
      return
    }

    try {
      await clearImageStore(imagesDirectory)
    } catch (error) {
      console.error(
        `The dev images could not be cleared: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      app.exit(1)
      return
    }
  }

  let operationDelayMs = 0
  if (devDbDelay !== undefined) {
    try {
      operationDelayMs = parseDbDelayArgument(devDbDelay)
    } catch (error) {
      console.error(
        `The dev db delay could not be applied: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      app.exit(1)
      return
    }
  }

  let failingOperations: DatabaseOperationName[] = []
  if (devDbFailures !== undefined) {
    try {
      failingOperations = parseDbFailureArgument(devDbFailures)
    } catch (error) {
      console.error(
        `The dev db failure could not be applied: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      app.exit(1)
      return
    }
  }

  let database: WordAppDatabase
  try {
    database = openDatabase(databasePath, {
      operationDelayMs,
      failingOperations,
    })
  } catch (error) {
    console.error(
      `The database could not be opened: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    dialog.showErrorBox('WordApp', 'پایگاه داده باز نشد. برنامه بسته می شود.')
    app.exit(1)
    return
  }

  const imageStore = await createImageStore(imagesDirectory)

  try {
    await imageStore.sweep(await database.listDocumentBodies())
  } catch (error) {
    console.error(
      `The images could not be swept: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  handleImageProtocol(imagesDirectory)

  const deleteDocumentWithCleanup = async (id: number): Promise<void> => {
    await database.deleteDocument(id)
    await imageStore.removeDocument(id)
  }

  const deleteDocumentsWithCleanup = async (ids: number[]): Promise<void> => {
    await database.deleteDocuments(ids)

    for (const id of ids) {
      await imageStore.removeDocument(id)
    }
  }

  const activeDocumentRequests = new Map<string, AbortController>()
  const canceledDocumentRequests = new Set<string>()

  const rememberCanceledDocumentRequest = (requestId: string): void => {
    if (canceledDocumentRequests.size >= 64) {
      const oldestRequestId = canceledDocumentRequests.values().next().value
      if (oldestRequestId !== undefined) {
        canceledDocumentRequests.delete(oldestRequestId)
      }
    }

    canceledDocumentRequests.add(requestId)
  }

  const runDocumentRequest = async <T>(
    requestId: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined> => {
    if (canceledDocumentRequests.delete(requestId)) {
      return undefined
    }

    const controller = new AbortController()
    activeDocumentRequests.set(requestId, controller)

    try {
      return await operation(controller.signal)
    } finally {
      activeDocumentRequests.delete(requestId)
    }
  }

  ipcMain.on(documentsCancelChannel, (_event, requestId: unknown) => {
    if (!isDocumentRequestId(requestId)) {
      return
    }

    const controller = activeDocumentRequests.get(requestId)
    if (controller === undefined) {
      rememberCanceledDocumentRequest(requestId)
      return
    }

    controller.abort()
  })

  ipcMain.handle(documentsCreateChannel, () => database.createDocument())
  ipcMain.handle(documentsGetChannel, (_event, id: unknown) =>
    typeof id === 'number' && Number.isSafeInteger(id)
      ? database.getDocument(id)
      : undefined,
  )
  ipcMain.handle(documentsCountChannel, (_event, value: unknown) => {
    if (!isDocumentRequest(value)) {
      return undefined
    }

    const { requestId, payload } = value
    if (payload !== undefined && typeof payload !== 'string') {
      return undefined
    }

    const search = payload
    return runDocumentRequest(requestId, (signal) =>
      database.countDocuments(search, signal),
    )
  })
  ipcMain.handle(documentsListChannel, (_event, value: unknown) => {
    if (!isDocumentRequest(value)) {
      return undefined
    }

    const { requestId, payload } = value
    if (!isDocumentListOptions(payload)) {
      return undefined
    }

    return runDocumentRequest(requestId, (signal) =>
      database.listDocuments(payload, signal),
    )
  })
  ipcMain.handle(documentsDeleteChannel, (_event, id: unknown) =>
    typeof id === 'number' && Number.isSafeInteger(id)
      ? deleteDocumentWithCleanup(id)
      : undefined,
  )
  ipcMain.handle(documentsDeleteManyChannel, (_event, ids: unknown) =>
    isDocumentIds(ids) ? deleteDocumentsWithCleanup(ids) : undefined,
  )
  ipcMain.handle(
    documentsSaveChannel,
    (event, id: unknown, changes: unknown) => {
      if (
        typeof id !== 'number' ||
        !Number.isSafeInteger(id) ||
        !isDocumentChanges(changes)
      ) {
        return undefined
      }

      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      beginWindowSave(browserWindow)

      let saved: ReturnType<WordAppDatabase['saveDocument']>
      try {
        saved = database.saveDocument(id, changes)
      } catch (error) {
        endWindowSave(browserWindow)
        throw error
      }

      void Promise.resolve(saved).then(
        () => endWindowSave(browserWindow),
        () => endWindowSave(browserWindow),
      )
      return saved
    },
  )
  ipcMain.handle(imagesSaveChannel, (_event, value: unknown) =>
    isImageSaveRequest(value) ? imageStore.save(value) : undefined,
  )
  ipcMain.handle(imagesCopyChannel, (_event, value: unknown) =>
    isImageSourceRequest(value) ? imageStore.copy(value) : undefined,
  )
  ipcMain.handle(imagesCollectChannel, (_event, value: unknown) =>
    isImageCollectRequest(value) ? imageStore.collect(value) : undefined,
  )

  app.on('will-quit', () => {
    database.close()
  })

  createWindow(operationDelayMs + closeHandshakeGraceMs)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(operationDelayMs + closeHandshakeGraceMs)
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    const [existingWindow] = BrowserWindow.getAllWindows()
    if (existingWindow === undefined) {
      return
    }

    if (existingWindow.isMinimized()) {
      existingWindow.restore()
    }
    existingWindow.focus()
  })

  void startApp().catch((error) => {
    console.error(
      `The app could not start: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    dialog.showErrorBox(
      'WordApp',
      'آغاز برنامه ناموفق بود. برنامه بسته می شود.',
    )
    app.exit(1)
  })
} else {
  app.quit()
}
