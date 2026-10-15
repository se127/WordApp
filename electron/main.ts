import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import path from 'node:path'
import { rendererReadyChannel } from './ipc.ts'

// The project root in dev (`electron .`) and the app.asar root in the packaged
// app; both contain dist/ and dist-electron/. Do not use __dirname here: the
// bundler replaces it with this file's build-time source directory, which
// breaks these paths in both dev and the installed app.
const appRoot = app.getAppPath()

const devServerUrl = app.isPackaged
  ? undefined
  : process.env.VITE_DEV_SERVER_URL

// Windows are created hidden (see createWindow) and revealed only once the
// renderer reports that React has mounted. This applies to both the dev server
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

ipcMain.on(rendererReadyChannel, (event) => {
  const browserWindow = BrowserWindow.fromWebContents(event.sender)
  if (!browserWindow) {
    return
  }

  revealWindow(browserWindow)
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
      preload: path.join(appRoot, 'dist-electron', 'preload.cjs'),
    },
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

  // Keep loopback requests (the dev server page and its HMR websocket) off the
  // system proxy: VPN/TUN proxy clients otherwise intercept them, failing the
  // load with ERR_NETWORK_CHANGED and killing HMR. Setting this on the session
  // is the only way that works — the `--proxy-bypass-list` switch only takes
  // effect together with `--proxy-server`, which we deliberately do not set.
  await session.defaultSession.setProxy({
    mode: 'system',
    proxyBypassRules: '<local>',
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
