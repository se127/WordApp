import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
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
} from './database.ts'
import {
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsDeleteManyChannel,
  documentsGetChannel,
  documentsListChannel,
  documentsSaveChannel,
} from './ipc.ts'

const appRoot = app.getAppPath()

const devServerUrl = app.isPackaged
  ? undefined
  : process.env.VITE_DEV_SERVER_URL

const devSeed = app.isPackaged ? undefined : process.env.DEV_SEED

const devDbDelay = app.isPackaged ? undefined : process.env.DEV_DB_DELAY

const devDbFailures = app.isPackaged ? undefined : process.env.DEV_DB_FAILURE

const revealedWindows = new WeakSet<BrowserWindow>()

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

function createWindow(): void {
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
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  loadPage()
}

function isDocumentChanges(value: unknown): value is DocumentChanges {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { title, body } = value as { title?: unknown; body?: unknown }
  return (
    (title === undefined || typeof title === 'string') &&
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

  const { offset, limit, order } = value as {
    offset?: unknown
    limit?: unknown
    order?: unknown
  }
  return (
    typeof offset === 'number' &&
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    typeof limit === 'number' &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    (order === undefined || order === 'newest' || order === 'oldest')
  )
}

void app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.wordapp.app')
  }

  if (app.isPackaged) {
    Menu.setApplicationMenu(null)
  }

  await session.defaultSession.setProxy({
    mode: 'system',
    proxyBypassRules: '<local>',
  })

  const databasePath = app.isPackaged
    ? path.join(app.getPath('userData'), 'db.sqlite')
    : path.join(app.getAppPath(), 'dev-data', 'db.sqlite')

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

  const database = openDatabase(databasePath, {
    operationDelayMs,
    failingOperations,
  })

  ipcMain.handle(documentsCreateChannel, () => database.createDocument())
  ipcMain.handle(documentsGetChannel, (_event, id: unknown) =>
    typeof id === 'number' && Number.isSafeInteger(id)
      ? database.getDocument(id)
      : undefined,
  )
  ipcMain.handle(documentsCountChannel, () => database.countDocuments())
  ipcMain.handle(documentsListChannel, (_event, options: unknown) =>
    isDocumentListOptions(options)
      ? database.listDocuments(options)
      : undefined,
  )
  ipcMain.handle(documentsDeleteChannel, (_event, id: unknown) =>
    typeof id === 'number' && Number.isSafeInteger(id)
      ? database.deleteDocument(id)
      : undefined,
  )
  ipcMain.handle(documentsDeleteManyChannel, (_event, ids: unknown) =>
    isDocumentIds(ids) ? database.deleteDocuments(ids) : undefined,
  )
  ipcMain.handle(
    documentsSaveChannel,
    (_event, id: unknown, changes: unknown) =>
      typeof id === 'number' &&
      Number.isSafeInteger(id) &&
      isDocumentChanges(changes)
        ? database.saveDocument(id, changes)
        : undefined,
  )

  app.on('will-quit', () => {
    database.close()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
