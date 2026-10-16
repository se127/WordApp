import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  session,
  shell,
} from 'electron'
import path from 'node:path'
import {
  openDatabase,
  parseDbDelayArgument,
  parseSeedArgument,
  resetDatabase,
} from './database.ts'
import {
  documentsCountChannel,
  documentsCreateChannel,
  documentsGetChannel,
  windowCloseChannel,
  windowIsMaximizedChannel,
  windowMaximizedChangedChannel,
  windowMinimizeChannel,
  windowToggleMaximizeChannel,
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

// Windows are created hidden (see createWindow) and revealed as soon as the
// renderer has painted its first frame — index.html's static loading screen,
// already on the right theme — instead of waiting for React to mount, so the
// app shows right away while its bundle loads. Applies to both the dev server
// and the packaged app, since they share this main process.
const revealedWindows = new WeakSet<BrowserWindow>()

// Windows grows a maximized frameless window beyond the display's work area by
// the invisible resize border, which pushes that many pixels of the top of the
// renderer off-screen (the drag zone and its caption buttons). Snap the
// maximized window back to the work area; it stays maximized.
function snapMaximizedBounds(browserWindow: BrowserWindow): void {
  if (process.platform !== 'win32' || browserWindow.isDestroyed()) {
    return
  }

  const { workArea } = screen.getDisplayMatching(browserWindow.getBounds())
  browserWindow.setBounds(workArea)
}

function revealWindow(browserWindow: BrowserWindow): void {
  if (browserWindow.isDestroyed() || revealedWindows.has(browserWindow)) {
    return
  }
  revealedWindows.add(browserWindow)

  // Maximize before showing so the window never appears at its default size.
  browserWindow.maximize()
  snapMaximizedBounds(browserWindow)
  browserWindow.show()
}

// The renderer draws its own caption buttons (the window is frameless) and
// asks the main process to act on the window that sent the request.
ipcMain.on(windowMinimizeChannel, (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on(windowToggleMaximizeChannel, (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender)
  if (!browserWindow) {
    return
  }

  if (browserWindow.isMaximized()) {
    browserWindow.unmaximize()
  } else {
    browserWindow.maximize()
  }
})

ipcMain.on(windowCloseChannel, (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle(windowIsMaximizedChannel, (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
})

// ERR_NETWORK_CHANGED: Chromium aborted the in-flight request because the
// network changed, which VPN/TUN adapters or their route changes cause.
const errNetworkChanged = -106
const maxLoadAttempts = 5

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    minWidth: 800,
    minHeight: 600,
    show: false,
    // Frameless: no native title bar, so no window buttons, title, or icon.
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      // DevTools are a development affordance only: the dev default menu
      // opens them, and the packaged app disables the facility entirely.
      devTools: !app.isPackaged,
      preload: path.join(appRoot, 'dist-electron', 'preload.cjs'),
    },
  })

  // Keep the renderer's maximize/restore button in sync with the real window
  // state, whether it changes from the renderer, a keyboard shortcut, or
  // revealWindow maximizing the window before it is shown.
  const sendMaximizedState = (): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        windowMaximizedChangedChannel,
        mainWindow.isMaximized(),
      )
    }
  }

  // The work-area snap also runs here because the window can be maximized
  // again later (caption button, keyboard shortcut, drag to the screen edge).
  mainWindow.on('maximize', () => {
    snapMaximizedBounds(mainWindow)
    sendMaximizedState()
  })
  mainWindow.on('unmaximize', sendMaximizedState)

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

  const database = openDatabase(databasePath, { operationDelayMs })

  ipcMain.handle(documentsCreateChannel, () => database.createDocument())
  ipcMain.handle(documentsGetChannel, (_event, id: unknown) =>
    typeof id === 'number' && Number.isSafeInteger(id)
      ? database.getDocument(id)
      : undefined,
  )
  ipcMain.handle(documentsCountChannel, () => database.countDocuments())

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
