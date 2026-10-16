import path from 'node:path'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest'
import {
  rendererReadyChannel,
  windowCloseChannel,
  windowIsMaximizedChannel,
  windowMaximizedChangedChannel,
  windowMinimizeChannel,
  windowToggleMaximizeChannel,
} from '../../electron/ipc.ts'

// Everything electron/main.ts touches is mocked; the mutable pieces (packaged
// flag, captured window options) are read through this object, so each test
// can import a fresh copy of main.ts with the state it needs.
const mocks = vi.hoisted(() => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 }

  const win = {
    isDestroyed: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1920, height: 1080 })),
    setBounds: vi.fn(),
    loadURL: vi.fn(async () => {}),
    loadFile: vi.fn(async () => {}),
    on: vi.fn(),
    webContents: {
      on: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
  }

  const created: unknown[] = []
  const state: { isPackaged: boolean; options: unknown } = {
    isPackaged: false,
    options: undefined,
  }

  const BrowserWindow = Object.assign(
    vi.fn(function (this: Record<string, unknown>, options: unknown) {
      state.options = options
      Object.assign(this, win)
      created.push(this)
    }),
    {
      fromWebContents: vi.fn((..._args: unknown[]) => created[0] ?? null),
      getAllWindows: vi.fn(() => created),
    },
  )

  const app = {
    get isPackaged() {
      return state.isPackaged
    },
    getAppPath: vi.fn(() => 'C:/fake/wordapp'),
    whenReady: vi.fn(async () => {}),
    on: vi.fn(),
    setAppUserModelId: vi.fn(),
    quit: vi.fn(),
  }

  return {
    BrowserWindow,
    Menu: { setApplicationMenu: vi.fn() },
    app,
    created,
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    screen: { getDisplayMatching: vi.fn(() => ({ workArea })) },
    session: { defaultSession: { setProxy: vi.fn(async () => {}) } },
    shell: { openExternal: vi.fn(async () => {}) },
    state,
    win,
    workArea,
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
  ipcMain: mocks.ipcMain,
  Menu: mocks.Menu,
  screen: mocks.screen,
  session: mocks.session,
  shell: mocks.shell,
}))

type WindowOptions = {
  frame?: boolean
  show?: boolean
  autoHideMenuBar?: boolean
  webPreferences?: { devTools?: boolean; preload?: string }
}

const asMock = (fn: unknown) => fn as Mock<(...args: unknown[]) => unknown>

function handlerFor(emitter: 'on' | 'handle', channel: string) {
  const call = asMock(mocks.ipcMain[emitter]).mock.calls.find(
    ([name]) => name === channel,
  )
  if (!call) {
    throw new Error(`No ipcMain.${emitter} handler registered for ${channel}`)
  }
  return call[1] as (...args: unknown[]) => unknown
}

function listenerOn(emitter: { on: unknown }, event: string) {
  const call = asMock(emitter.on).mock.calls.find(([name]) => name === event)
  if (!call) {
    throw new Error(`No listener registered for ${event}`)
  }
  return call[1] as (...args: unknown[]) => unknown
}

const originalPlatform = process.platform

function stubPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

async function importMain({ isPackaged = false, devServerUrl = '' } = {}) {
  vi.resetModules()
  mocks.state.isPackaged = isPackaged
  mocks.state.options = undefined
  vi.stubEnv('VITE_DEV_SERVER_URL', devServerUrl)

  await import('../../electron/main.ts')
  await vi.waitFor(() => {
    expect(mocks.created.length).toBe(1)
  })
}

function windowOptions(): WindowOptions {
  return mocks.state.options as WindowOptions
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.created.length = 0
  mocks.state.isPackaged = false
  mocks.state.options = undefined
  mocks.win.isDestroyed.mockReturnValue(false)
  mocks.win.isMaximized.mockReturnValue(false)
  // Restore the "window exists" default in case a test made it return null.
  mocks.BrowserWindow.fromWebContents.mockReset()
  mocks.BrowserWindow.fromWebContents.mockImplementation(
    () => mocks.created[0] ?? null,
  )
})

afterEach(() => {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  })
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('packaged app', () => {
  it('drops the default menu, disables DevTools, and loads the bundled page', async () => {
    stubPlatform('win32')

    // Even a stray dev-server URL must be ignored in a packaged build.
    await importMain({
      isPackaged: true,
      devServerUrl: 'http://127.0.0.1:5173/',
    })

    expect(mocks.app.setAppUserModelId).toHaveBeenCalledWith('com.wordapp.app')
    expect(mocks.Menu.setApplicationMenu).toHaveBeenCalledExactlyOnceWith(null)

    const options = windowOptions()
    expect(options.frame).toBe(false)
    expect(options.show).toBe(false)
    expect(options.autoHideMenuBar).toBe(true)
    expect(options.webPreferences?.devTools).toBe(false)
    expect(options.webPreferences?.preload).toBe(
      path.join('C:/fake/wordapp', 'dist-electron', 'preload.cjs'),
    )

    expect(mocks.win.loadFile).toHaveBeenCalledWith(
      path.join('C:/fake/wordapp', 'dist', 'index.html'),
    )
    expect(mocks.win.loadURL).not.toHaveBeenCalled()
  })
})

describe('dev run', () => {
  it('keeps the menu and DevTools and loads the dev server URL', async () => {
    stubPlatform('win32')

    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })

    expect(mocks.Menu.setApplicationMenu).not.toHaveBeenCalled()
    expect(windowOptions().webPreferences?.devTools).toBe(true)
    expect(mocks.win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/')
    expect(mocks.session.defaultSession.setProxy).toHaveBeenCalledWith({
      mode: 'system',
      proxyBypassRules: '<local>',
    })
  })
})

describe('renderer ready', () => {
  it('maximizes, snaps to the work area, and shows the window exactly once', async () => {
    stubPlatform('win32')
    await importMain()

    const notifyReady = handlerFor('on', rendererReadyChannel)
    const event = { sender: {} }

    notifyReady(event)
    expect(mocks.win.maximize).toHaveBeenCalledOnce()
    expect(mocks.win.setBounds).toHaveBeenCalledWith(mocks.workArea)
    expect(mocks.win.show).toHaveBeenCalledOnce()

    notifyReady(event)
    expect(mocks.win.show).toHaveBeenCalledOnce()
  })

  it('skips the work-area snap outside Windows', async () => {
    stubPlatform('darwin')
    await importMain()

    handlerFor('on', rendererReadyChannel)({ sender: {} })

    expect(mocks.win.show).toHaveBeenCalledOnce()
    expect(mocks.win.setBounds).not.toHaveBeenCalled()
  })

  it('reveals the window if the renderer process dies before ready', async () => {
    stubPlatform('win32')
    await importMain()

    listenerOn(mocks.win.webContents, 'render-process-gone')()

    expect(mocks.win.show).toHaveBeenCalledOnce()
  })
})

describe('closed window', () => {
  it('ignores every request when the window is already gone', async () => {
    await importMain()
    mocks.BrowserWindow.fromWebContents.mockReturnValue(null)
    const event = { sender: {} }

    handlerFor('on', rendererReadyChannel)(event)
    handlerFor('on', windowMinimizeChannel)(event)
    handlerFor('on', windowToggleMaximizeChannel)(event)
    handlerFor('on', windowCloseChannel)(event)

    expect(handlerFor('handle', windowIsMaximizedChannel)(event)).toBe(false)
    expect(mocks.win.show).not.toHaveBeenCalled()
    expect(mocks.win.minimize).not.toHaveBeenCalled()
    expect(mocks.win.maximize).not.toHaveBeenCalled()
    expect(mocks.win.close).not.toHaveBeenCalled()
  })

  it('leaves a destroyed window untouched instead of revealing it', async () => {
    stubPlatform('win32')
    await importMain()
    mocks.win.isDestroyed.mockReturnValue(true)

    handlerFor('on', rendererReadyChannel)({ sender: {} })
    listenerOn(mocks.win.webContents, 'render-process-gone')()
    listenerOn(mocks.win, 'maximize')()

    expect(mocks.win.show).not.toHaveBeenCalled()
    expect(mocks.win.maximize).not.toHaveBeenCalled()
    expect(mocks.win.setBounds).not.toHaveBeenCalled()
    expect(mocks.win.webContents.send).not.toHaveBeenCalled()
  })
})

describe('caption buttons', () => {
  it('routes every channel to the window that sent it', async () => {
    await importMain()
    const event = { sender: {} }

    handlerFor('on', windowMinimizeChannel)(event)
    expect(mocks.win.minimize).toHaveBeenCalledOnce()

    mocks.win.isMaximized.mockReturnValue(false)
    handlerFor('on', windowToggleMaximizeChannel)(event)
    expect(mocks.win.maximize).toHaveBeenCalledOnce()

    mocks.win.isMaximized.mockReturnValue(true)
    handlerFor('on', windowToggleMaximizeChannel)(event)
    expect(mocks.win.unmaximize).toHaveBeenCalledOnce()

    handlerFor('on', windowCloseChannel)(event)
    expect(mocks.win.close).toHaveBeenCalledOnce()

    expect(handlerFor('handle', windowIsMaximizedChannel)(event)).toBe(true)
  })
})

describe('window state sync', () => {
  it('snaps on maximize and pushes every change to the renderer', async () => {
    stubPlatform('win32')
    await importMain()

    mocks.win.isMaximized.mockReturnValue(true)
    listenerOn(mocks.win, 'maximize')()
    expect(mocks.win.setBounds).toHaveBeenCalledWith(mocks.workArea)
    expect(mocks.win.webContents.send).toHaveBeenLastCalledWith(
      windowMaximizedChangedChannel,
      true,
    )

    mocks.win.isMaximized.mockReturnValue(false)
    listenerOn(mocks.win, 'unmaximize')()
    expect(mocks.win.webContents.send).toHaveBeenLastCalledWith(
      windowMaximizedChangedChannel,
      false,
    )
  })
})

describe('load failures', () => {
  it('retries a network-changed failure instead of revealing anything', async () => {
    stubPlatform('win32')
    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })
    vi.useFakeTimers()

    const failed = listenerOn(mocks.win.webContents, 'did-fail-load')
    failed({}, -106, 'ERR_NETWORK_CHANGED', 'http://127.0.0.1:5173/', true)

    expect(mocks.win.show).not.toHaveBeenCalled()
    const loadsSoFar = mocks.win.loadURL.mock.calls.length

    vi.advanceTimersByTime(500)

    expect(mocks.win.loadURL).toHaveBeenCalledTimes(loadsSoFar + 1)
    expect(mocks.win.show).not.toHaveBeenCalled()
  })

  it('gives up retrying when the attempts are exhausted', async () => {
    stubPlatform('win32')
    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })
    vi.useFakeTimers()

    const failed = listenerOn(mocks.win.webContents, 'did-fail-load')
    for (let attempt = 0; attempt < 6; attempt += 1) {
      failed({}, -106, 'ERR_NETWORK_CHANGED', 'http://127.0.0.1:5173/', true)
      vi.advanceTimersByTime(500)
    }

    // The initial load plus five retries, then the window is revealed.
    expect(mocks.win.loadURL).toHaveBeenCalledTimes(6)
    expect(mocks.win.show).toHaveBeenCalledOnce()
  })

  it('reveals the window when the main frame fails for any other reason', async () => {
    stubPlatform('win32')
    await importMain()

    listenerOn(mocks.win.webContents, 'did-fail-load')(
      {},
      -105,
      'ERR_NAME_NOT_RESOLVED',
      '',
      true,
    )

    expect(mocks.win.show).toHaveBeenCalledOnce()
  })

  it('ignores subframe failures', async () => {
    stubPlatform('win32')
    await importMain()

    listenerOn(mocks.win.webContents, 'did-fail-load')(
      {},
      -105,
      'ERR_NAME_NOT_RESOLVED',
      '',
      false,
    )

    expect(mocks.win.show).not.toHaveBeenCalled()
  })

  it('resets the retry budget after a successful load', async () => {
    stubPlatform('win32')
    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })
    vi.useFakeTimers()

    const failed = listenerOn(mocks.win.webContents, 'did-fail-load')
    for (let attempt = 0; attempt < 5; attempt += 1) {
      failed({}, -106, 'ERR_NETWORK_CHANGED', 'http://127.0.0.1:5173/', true)
      vi.advanceTimersByTime(500)
    }

    // The initial load plus five retries, with nothing revealed yet.
    expect(mocks.win.loadURL).toHaveBeenCalledTimes(6)
    expect(mocks.win.show).not.toHaveBeenCalled()

    // A successful load starts over with a fresh retry budget: the next
    // network-changed failure retries again instead of revealing the window.
    listenerOn(mocks.win.webContents, 'did-finish-load')()
    failed({}, -106, 'ERR_NETWORK_CHANGED', 'http://127.0.0.1:5173/', true)
    vi.advanceTimersByTime(500)

    expect(mocks.win.loadURL).toHaveBeenCalledTimes(7)
    expect(mocks.win.show).not.toHaveBeenCalled()
  })

  it('does not retry into a window that was destroyed in the meantime', async () => {
    stubPlatform('win32')
    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })
    vi.useFakeTimers()
    mocks.win.isDestroyed.mockReturnValue(true)

    listenerOn(mocks.win.webContents, 'did-fail-load')(
      {},
      -106,
      'ERR_NETWORK_CHANGED',
      'http://127.0.0.1:5173/',
      true,
    )
    vi.advanceTimersByTime(500)

    // The scheduled retry saw the destroyed window and skipped the load.
    expect(mocks.win.loadURL).toHaveBeenCalledTimes(1)
    expect(mocks.win.show).not.toHaveBeenCalled()
  })
})

describe('external links', () => {
  it('opens links in the system browser and denies the popup', async () => {
    await importMain()

    const handler = asMock(mocks.win.webContents.setWindowOpenHandler).mock
      .calls[0]?.[0] as (details: { url: string }) => unknown
    expect(handler).toBeTypeOf('function')

    const result = handler({ url: 'https://example.com' })

    expect(mocks.shell.openExternal).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ action: 'deny' })
  })
})

describe('app lifecycle', () => {
  it('quits when every window is closed outside macOS', async () => {
    stubPlatform('win32')
    await importMain()

    const closed = asMock(mocks.app.on).mock.calls.find(
      ([event]) => event === 'window-all-closed',
    )?.[1] as () => void
    expect(closed).toBeTypeOf('function')

    closed()

    expect(mocks.app.quit).toHaveBeenCalledOnce()
  })

  it('re-creates the window on activate when none are open', async () => {
    stubPlatform('win32')
    await importMain()
    expect(mocks.created.length).toBe(1)

    const activate = asMock(mocks.app.on).mock.calls.find(
      ([event]) => event === 'activate',
    )?.[1] as () => void
    expect(activate).toBeTypeOf('function')

    mocks.BrowserWindow.getAllWindows.mockReturnValueOnce([])
    activate()

    expect(mocks.created.length).toBe(2)

    // With a window already open, activate does nothing.
    activate()
    expect(mocks.created.length).toBe(2)
  })

  it('stays alive when every window closes on macOS', async () => {
    stubPlatform('darwin')
    await importMain()

    const closed = asMock(mocks.app.on).mock.calls.find(
      ([event]) => event === 'window-all-closed',
    )?.[1] as () => void
    expect(closed).toBeTypeOf('function')

    closed()

    expect(mocks.app.quit).not.toHaveBeenCalled()
  })
})
