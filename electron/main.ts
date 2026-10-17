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
  documentsSaveChannel,
} from './ipc.ts'

// The project root in dev (`electron .`) and the app.asar root in the packaged
// app; both contain dist/ and dist-electron/. Do not use __dirname here: the
// bundler replaces it with this file's build-time source directory, which
// breaks these paths in both dev and the installed app.
const appRoot = app.getAppPath()

const devServerUrl = app.isPackaged
  ? undefined
  : process.env.VITE_DEV_SERVER_URL

// Set by scripts/electron.ts on every dev run (empty when no --seed was
// passed): the dev database is always reset — everything wiped, plus the seed
// rows from --seed. Packaged builds never see the variable.
const devSeed = app.isPackaged ? undefined : process.env.DEV_SEED

// Set by scripts/electron.ts only when --db-delay was passed: every database
// operation waits that long before running, so the renderer's loading states
// can be watched by hand. Packaged builds never see the variable.
const devDbDelay = app.isPackaged ? undefined : process.env.DEV_DB_DELAY

// Set by scripts/electron.ts on every dev run (empty when no
// --with-db-failure was passed, or its prompt picked nothing): the picked
// operations fail instead of running their query, so the renderer's error
// handling can be exercised by hand. Packaged builds never see the variable.
const devDbFailures = app.isPackaged ? undefined : process.env.DEV_DB_FAILURE

// Windows are created hidden (see createWindow) and revealed as soon as the
// renderer has painted its first frame — index.html's static loading screen,
// already on the right theme — instead of waiting for React to mount, so the
// app shows right away while its bundle loads. Applies to both the dev server
// and the packaged app, since they share this main process.
const revealedWindows = new WeakSet<BrowserWindow>()

function revealWindow(browserWindow: BrowserWindow): void {
  if (browserWindow.isDestroyed() || revealedWindows.has(browserWindow)) {
    return
  }
  revealedWindows.add(browserWindow)

  // Maximize before showing so the window never appears at its default size.
  browserWindow.maximize()
  browserWindow.show()
}

// ERR_NETWORK_CHANGED: Chromium aborted the in-flight request because the
// network changed, which VPN/TUN adapters or their route changes cause.
const errNetworkChanged = -106
const maxLoadAttempts = 5

function createWindow(): void {
  // The default native frame stays on, so the OS title bar (with its
  // minimize, maximize, and close buttons) is part of the window; the app
  // draws no caption buttons of its own.
  const mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // DevTools are a development affordance only: the dev default menu
      // opens them, and the packaged app disables the facility entirely.
      devTools: !app.isPackaged,
      preload: path.join(appRoot, 'dist-electron', 'preload.cjs'),
    },
  })

  // The renderer painted its first frame — the loading screen from index.html,
  // already on the stored theme — so reveal the window right away instead of
  // waiting for React to mount.
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
  // Safety net: if the renderer dies or its main frame fails to load, reveal the
  // window anyway so a broken renderer is visible instead of an invisible app.
  mainWindow.webContents.on('render-process-gone', () => {
    revealWindow(mainWindow)
  })
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
      if (!isMainFrame) {
        return
      }

      // A TUN network change during startup can abort the load; retry briefly
      // instead of treating it as a real failure.
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

// Narrows the renderer's payload for the save channel: the changes must be an
// object whose title and body — when present — are strings.
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

  // The default application menu carries development accelerators: reload
  // (Ctrl+R), DevTools (Ctrl+Shift+I), zoom, and fullscreen. autoHideMenuBar
  // hides its bar but leaves those accelerators live, so the packaged app
  // removes the menu entirely. Dev keeps it for its shortcuts.
  if (app.isPackaged) {
    Menu.setApplicationMenu(null)
  }

  // Keep loopback requests (the dev server page and its HMR websocket) off the
  // system proxy: VPN/TUN proxy clients otherwise intercept them, failing the
  // load with ERR_NETWORK_CHANGED and killing HMR. Setting this on the session
  // is the only way that works — the `--proxy-bypass-list` switch only takes
  // effect together with `--proxy-server`, which we deliberately do not set.
  await session.defaultSession.setProxy({
    mode: 'system',
    proxyBypassRules: '<local>',
  })

  // One SQLite database holds every document, and the main process is its
  // only connection; the renderer reaches it through the document channels.
  // Packaged builds keep the file in the per-user app data folder, while dev
  // runs keep it in a project-local `dev-data` folder, so experimenting never
  // touches the installed app's real data.
  const databasePath = app.isPackaged
    ? path.join(app.getPath('userData'), 'db.sqlite')
    : path.join(app.getAppPath(), 'dev-data', 'db.sqlite')

  // Dev runs start from a prepared database: every table is emptied and the
  // --seed rows are inserted before the store opens and the window shows, so
  // the first count the renderer asks for already sees the seeded rows.
  if (devSeed !== undefined) {
    try {
      const seed = parseSeedArgument(devSeed)
      resetDatabase(databasePath, seed)

      // The dev script inherits this process's output, so these lines show up
      // in the terminal that ran `bun dev`.
      for (const { table, count } of seed) {
        console.log(`Seeded ${table}: ${count}`)
      }
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

  // The dev-only --db-delay flag slows every database operation down inside
  // the store; like the seed lines above, the echo shows up in the terminal
  // that ran `bun dev`.
  let operationDelayMs = 0
  if (devDbDelay !== undefined) {
    try {
      operationDelayMs = parseDbDelayArgument(devDbDelay)

      if (devDbDelay !== '') {
        console.log(`db-delay: ${operationDelayMs}ms`)
      }
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

  // The dev-only --with-db-failure flag makes the operations its prompt
  // picked fail instead of running; like the seed and delay lines above, the
  // echo shows up in the terminal that ran `bun dev`.
  let failingOperations: DatabaseOperationName[] = []
  if (devDbFailures !== undefined) {
    try {
      failingOperations = parseDbFailureArgument(devDbFailures)

      if (failingOperations.length > 0) {
        console.log(`db-failure: ${failingOperations.join(', ')}`)
      }
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
