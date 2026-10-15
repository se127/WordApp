import { app, BrowserWindow, ipcMain, shell } from 'electron'
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

  // Safety net: if the renderer dies or its main frame fails to load, reveal the
  // window anyway so a broken renderer is visible instead of an invisible app.
  mainWindow.webContents.on('render-process-gone', () => {
    revealWindow(mainWindow)
  })
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, _errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
      if (isMainFrame) {
        revealWindow(mainWindow)
      }
    },
  )

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'))
  }
}

void app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.wordapp.app')
  }

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
