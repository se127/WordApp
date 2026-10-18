import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import path from 'node:path'
import {
  openDatabase,
  parseDbDelayArgument,
  parseDbFailureArgument,
  parseSeedArgument,
  resetDatabase,
} from './database.ts'
import type { DatabaseOperationName, DocumentChanges } from './database.ts'
import {
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsGetChannel,
  documentsListChannel,
  documentsSaveChannel,
  windowCloseChannel,
  windowIsMaximizedChannel,
  windowMaximizedChangedChannel,
  windowMinimizeChannel,
  windowToggleMaximizeChannel,
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
    titleBarStyle: 'hidden',
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

  const sendMaximizedState = (isMaximized: boolean): void => {
    if (mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(windowMaximizedChangedChannel, isMaximized)
  }

  mainWindow.on('maximize', () => sendMaximizedState(true))
  mainWindow.on('unmaximize', () => sendMaximizedState(false))

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
  ipcMain.handle(documentsListChannel, () => database.listDocuments())
  ipcMain.handle(documentsDeleteChannel, (_event, id: unknown) =>
    typeof id === 'number' && Number.isSafeInteger(id)
      ? database.deleteDocument(id)
      : undefined,
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

  ipcMain.handle(windowMinimizeChannel, (event) =>
    BrowserWindow.fromWebContents(event.sender)?.minimize(),
  )
  ipcMain.handle(windowToggleMaximizeChannel, (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)
    if (!target) {
      return
    }

    if (target.isMaximized()) {
      target.unmaximize()
    } else {
      target.maximize()
    }
  })
  ipcMain.handle(windowCloseChannel, (event) =>
    BrowserWindow.fromWebContents(event.sender)?.close(),
  )
  ipcMain.handle(windowIsMaximizedChannel, (event) => {
    const target = BrowserWindow.fromWebContents(event.sender)

    return target ? target.isMaximized() : false
  })

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
