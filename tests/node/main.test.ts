import path from 'node:path'
import { pathToFileURL } from 'node:url'
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
  imagesCopyChannel,
  imagesReconcileChannel,
  imagesRemoveChannel,
  imagesRestoreChannel,
  imagesSaveChannel,
} from '../../electron/ipc.ts'

const mocks = vi.hoisted(() => {
  const win = {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    maximize: vi.fn(),
    restore: vi.fn(),
    setClosable: vi.fn(),
    setFullScreen: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    focus: vi.fn(),
    loadURL: vi.fn(async () => {}),
    loadFile: vi.fn(async () => {}),
    on: vi.fn(),
    once: vi.fn(),
    webContents: {
      getURL: vi.fn(() => 'file:///C:/fake/wordapp/dist/index.html'),
      getZoomLevel: vi.fn(() => 0),
      on: vi.fn(),
      reload: vi.fn(),
      reloadIgnoringCache: vi.fn(),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      setZoomLevel: vi.fn(),
      toggleDevTools: vi.fn(),
    },
  }

  const created: unknown[] = []
  const dialog = { showErrorBox: vi.fn() }
  const state: { isPackaged: boolean; options: unknown } = {
    isPackaged: false,
    options: undefined,
  }

  const database = {
    createDocument: vi.fn(),
    getDocument: vi.fn(),
    countDocuments: vi.fn(),
    listDocuments: vi.fn(),
    deleteDocument: vi.fn(),
    deleteDocuments: vi.fn(),
    saveDocument: vi.fn(),
    close: vi.fn(),
  }

  const imageStore = {
    save: vi.fn(async () => ({
      src: 'wordapp-image://image/11111111-1111-4111-8111-111111111111.png',
    })),
    copy: vi.fn(async () => ({
      src: 'wordapp-image://image/33333333-3333-4333-8333-333333333333.png',
    })),
    remove: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    restore: vi.fn(async (request: unknown) => ({
      src: (request as { src: string }).src,
    })),
    reconcile: vi.fn(async () => {}),
    recover: vi.fn(
      async (
        _getDocument: (id: number) => Promise<{ body: string } | undefined>,
      ) => {},
    ),
    removeDocument: vi.fn(async () => {}),
  }

  const clearImageStore = vi.fn(async () => {})
  const createImageStore = vi.fn(async () => imageStore)

  const parseSeedArgument = vi.fn((value: string) =>
    value === '' ? [] : [{ table: 'documents', count: 3 }],
  )
  const parseDbDelayArgument = vi.fn((value: string) =>
    value === '' ? 0 : 2000,
  )
  const parseDbFailureArgument = vi.fn((value: string) =>
    value === '' ? [] : value.split(','),
  )
  const resetDatabase = vi.fn()

  const BrowserWindow = Object.assign(
    vi.fn(function (this: Record<string, unknown>, options: unknown) {
      state.options = options
      Object.assign(this, win)
      created.push(this)
    }),
    {
      getAllWindows: vi.fn(() => created),
      fromWebContents: vi.fn(() => created.at(-1) ?? win),
    },
  )

  const app = {
    get isPackaged() {
      return state.isPackaged
    },
    getAppPath: vi.fn(() => 'C:/fake/wordapp'),
    getPath: vi.fn(() => 'C:/fake/userdata'),
    whenReady: vi.fn(async () => {}),
    on: vi.fn(),
    setAppUserModelId: vi.fn(),
    exit: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
  }

  return {
    BrowserWindow,
    Menu: { setApplicationMenu: vi.fn() },
    app,
    clearImageStore,
    created,
    createImageStore,
    database,
    dialog,
    imageStore,
    ipcMain: {
      on: vi.fn(),
      handle: vi.fn(),
      removeListener: vi.fn(),
    },
    net: {
      fetch: vi.fn(async () => new Response(null, { status: 200 })),
    },
    openDatabase: vi.fn(() => database),
    parseDbDelayArgument,
    parseDbFailureArgument,
    parseSeedArgument,
    protocol: {
      registerSchemesAsPrivileged: vi.fn(),
      handle: vi.fn(),
    },
    resetDatabase,
    session: { defaultSession: { setProxy: vi.fn(async () => {}) } },
    shell: { openExternal: vi.fn(async () => {}) },
    state,
    win,
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.BrowserWindow,
  dialog: mocks.dialog,
  ipcMain: mocks.ipcMain,
  Menu: mocks.Menu,
  net: mocks.net,
  protocol: mocks.protocol,
  session: mocks.session,
  shell: mocks.shell,
}))

vi.mock('../../electron/database.ts', () => ({
  openDatabase: mocks.openDatabase,
  parseDbDelayArgument: mocks.parseDbDelayArgument,
  parseDbFailureArgument: mocks.parseDbFailureArgument,
  parseSeedArgument: mocks.parseSeedArgument,
  resetDatabase: mocks.resetDatabase,
}))

vi.mock('../../electron/images.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../electron/images.ts')>()

  return {
    ...actual,
    clearImageStore: mocks.clearImageStore,
  }
})

vi.mock('../../electron/image-store.ts', () => ({
  createImageStore: mocks.createImageStore,
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

function listenerOn(emitter: { on?: unknown; once?: unknown }, event: string) {
  const calls = [
    ...(emitter.on ? asMock(emitter.on).mock.calls : []),
    ...(emitter.once ? asMock(emitter.once).mock.calls : []),
  ]
  const call = calls.find(([name]) => name === event)
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

async function importMain({
  isPackaged = false,
  devServerUrl = '',
  expectWindow = true,
} = {}) {
  vi.resetModules()
  mocks.state.isPackaged = isPackaged
  mocks.state.options = undefined
  vi.stubEnv('VITE_DEV_SERVER_URL', devServerUrl)

  await import('../../electron/main.ts')
  if (expectWindow) {
    await vi.waitFor(() => {
      expect(mocks.created.length).toBe(1)
    })
  }
}

function windowOptions(): WindowOptions {
  return mocks.state.options as WindowOptions
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.created.length = 0
  mocks.state.isPackaged = false
  mocks.state.options = undefined
  mocks.database.getDocument.mockResolvedValue(undefined)
  mocks.win.isDestroyed.mockReturnValue(false)
  mocks.app.requestSingleInstanceLock.mockReturnValue(true)
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

    await importMain({
      isPackaged: true,
      devServerUrl: 'http://127.0.0.1:5173/',
    })

    expect(mocks.app.setAppUserModelId).toHaveBeenCalledWith('com.wordapp.app')
    expect(mocks.Menu.setApplicationMenu).toHaveBeenCalledExactlyOnceWith(null)

    const options = windowOptions()
    expect(options.frame).toBeUndefined()
    expect(options).not.toHaveProperty('titleBarStyle')
    expect(options.show).toBe(false)
    expect(options.autoHideMenuBar).toBe(true)
    expect(options.webPreferences?.devTools).toBe(false)
    expect(
      asMock(mocks.win.webContents.on).mock.calls.some(
        ([event]) => event === 'before-input-event',
      ),
    ).toBe(false)
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
  it('drops the menu but keeps DevTools and loads the dev server URL', async () => {
    stubPlatform('win32')

    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })

    expect(mocks.Menu.setApplicationMenu).toHaveBeenCalledExactlyOnceWith(null)
    expect(windowOptions().webPreferences?.devTools).toBe(true)
    expect(mocks.win.loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/')
    expect(mocks.session.defaultSession.setProxy).toHaveBeenCalledWith({
      mode: 'system',
      proxyBypassRules: '<local>',
    })
  })

  it('toggles DevTools with Ctrl+Shift+I in development', async () => {
    stubPlatform('win32')

    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })

    const onKey = listenerOn(mocks.win.webContents, 'before-input-event')
    const event = { preventDefault: vi.fn() }

    onKey(event, {
      type: 'keyDown',
      key: 'ی',
      code: 'KeyI',
      control: true,
      shift: true,
      alt: false,
      meta: false,
      isAutoRepeat: false,
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.win.webContents.toggleDevTools).toHaveBeenCalledOnce()

    onKey(event, {
      type: 'keyDown',
      key: 'ی',
      code: 'KeyI',
      control: true,
      shift: false,
      alt: false,
      meta: false,
      isAutoRepeat: false,
    })
    onKey(event, {
      type: 'keyDown',
      key: 'ی',
      code: 'KeyI',
      control: true,
      shift: true,
      alt: false,
      meta: false,
      isAutoRepeat: true,
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.win.webContents.toggleDevTools).toHaveBeenCalledOnce()
  })

  it('reloads the page with Ctrl+R and Ctrl+Shift+R in development', async () => {
    stubPlatform('win32')

    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })

    const onKey = listenerOn(mocks.win.webContents, 'before-input-event')
    const event = { preventDefault: vi.fn() }

    onKey(event, {
      type: 'keyDown',
      key: 'ق',
      code: 'KeyR',
      control: true,
      shift: false,
      alt: false,
      meta: false,
      isAutoRepeat: false,
    })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.win.webContents.reload).toHaveBeenCalledOnce()
    expect(mocks.win.webContents.reloadIgnoringCache).not.toHaveBeenCalled()

    onKey(event, {
      type: 'keyDown',
      key: 'ق',
      code: 'KeyR',
      control: true,
      shift: true,
      alt: false,
      meta: false,
      isAutoRepeat: false,
    })

    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    expect(mocks.win.webContents.reload).toHaveBeenCalledOnce()
    expect(mocks.win.webContents.reloadIgnoringCache).toHaveBeenCalledOnce()
  })

  it('keeps the View menu zoom and fullscreen shortcuts in development', async () => {
    stubPlatform('win32')

    await importMain({ devServerUrl: 'http://127.0.0.1:5173/' })

    const onKey = listenerOn(mocks.win.webContents, 'before-input-event')
    const event = { preventDefault: vi.fn() }
    const press = (input: Record<string, unknown>) =>
      onKey(event, {
        type: 'keyDown',
        control: true,
        shift: false,
        alt: false,
        meta: false,
        isAutoRepeat: false,
        ...input,
      })

    press({ key: '0', code: 'Digit0' })
    expect(mocks.win.webContents.setZoomLevel).toHaveBeenLastCalledWith(0)

    press({ key: '=', code: 'Equal' })
    expect(mocks.win.webContents.setZoomLevel).toHaveBeenLastCalledWith(0.5)

    press({ key: '+', code: 'Equal', shift: true })
    expect(mocks.win.webContents.setZoomLevel).toHaveBeenLastCalledWith(0.5)

    press({ key: '-', code: 'Minus' })
    expect(mocks.win.webContents.setZoomLevel).toHaveBeenLastCalledWith(-0.5)

    mocks.win.isFullScreen.mockReturnValueOnce(false)
    press({ key: 'F11', control: false })
    expect(mocks.win.setFullScreen).toHaveBeenLastCalledWith(true)

    mocks.win.isFullScreen.mockReturnValueOnce(true)
    press({ key: 'F11', control: false })
    expect(mocks.win.setFullScreen).toHaveBeenLastCalledWith(false)

    expect(event.preventDefault).toHaveBeenCalledTimes(6)
  })

  it('still opens the window when the system proxy cannot be configured', async () => {
    stubPlatform('win32')
    mocks.session.defaultSession.setProxy.mockRejectedValueOnce(
      new Error('proxy configuration failed'),
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await importMain()

      expect(mocks.created).toHaveLength(1)
      expect(consoleError).toHaveBeenCalledWith(
        'The system proxy could not be configured: proxy configuration failed',
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('window reveal', () => {
  it('maximizes and shows the window when the first frame is painted', async () => {
    stubPlatform('win32')
    await importMain()

    const painted = listenerOn(mocks.win, 'ready-to-show')

    painted()
    expect(mocks.win.maximize).toHaveBeenCalledOnce()
    expect(mocks.win.show).toHaveBeenCalledOnce()

    painted()
    expect(mocks.win.show).toHaveBeenCalledOnce()
  })

  it('reveals the window if the renderer process dies before the first frame', async () => {
    stubPlatform('win32')
    await importMain()

    listenerOn(mocks.win.webContents, 'render-process-gone')()

    expect(mocks.win.show).toHaveBeenCalledOnce()
  })

  it('leaves a destroyed window untouched instead of revealing it', async () => {
    stubPlatform('win32')
    await importMain()
    mocks.win.isDestroyed.mockReturnValue(true)

    listenerOn(mocks.win, 'ready-to-show')()
    listenerOn(mocks.win.webContents, 'render-process-gone')()

    expect(mocks.win.show).not.toHaveBeenCalled()
    expect(mocks.win.maximize).not.toHaveBeenCalled()
  })
})

describe('single instance', () => {
  it('quits before opening the database when another instance owns the lock', async () => {
    stubPlatform('win32')
    mocks.app.requestSingleInstanceLock.mockReturnValueOnce(false)

    await importMain({ expectWindow: false })

    expect(mocks.app.quit).toHaveBeenCalledOnce()
    expect(mocks.openDatabase).not.toHaveBeenCalled()
    expect(mocks.created).toHaveLength(0)
  })

  it('restores and focuses the existing window for a second launch', async () => {
    stubPlatform('win32')
    await importMain()
    mocks.win.isMinimized.mockReturnValueOnce(true)

    listenerOn(mocks.app, 'second-instance')()

    expect(mocks.win.restore).toHaveBeenCalledOnce()
    expect(mocks.win.focus).toHaveBeenCalledOnce()
  })
})

describe('window close handshake', () => {
  const closeEvent = () => ({ preventDefault: vi.fn() })

  it('asks the renderer to save before closing and closes after it is ready', async () => {
    stubPlatform('win32')
    await importMain()
    listenerOn(mocks.win, 'ready-to-show')()

    const ready = handlerFor('on', appCloseReadyChannel)
    ready({ sender: mocks.win.webContents })
    expect(mocks.win.close).not.toHaveBeenCalled()

    const event = closeEvent()
    listenerOn(mocks.win, 'close')(event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.win.webContents.send).toHaveBeenCalledWith(
      appBeforeCloseChannel,
    )
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    const repeated = closeEvent()
    listenerOn(mocks.win, 'close')(repeated)
    expect(repeated.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.win.webContents.send).toHaveBeenCalledOnce()
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    ready({ sender: {} })
    expect(mocks.win.close).not.toHaveBeenCalled()

    ready({ sender: mocks.win.webContents })
    ready({ sender: mocks.win.webContents })
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(true)
    expect(mocks.win.setClosable.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.win.close.mock.invocationCallOrder[0] ?? 0,
    )
    expect(mocks.win.close).toHaveBeenCalledOnce()
  })

  it('closes immediately before the first frame is revealed', async () => {
    stubPlatform('win32')
    await importMain()

    const event = closeEvent()
    listenerOn(mocks.win, 'close')(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(mocks.win.webContents.send).not.toHaveBeenCalled()
  })

  it('forces the close after the save grace period when the renderer stays silent', async () => {
    stubPlatform('win32')
    vi.stubEnv('DEV_DB_DELAY', '2000')
    await importMain()
    listenerOn(mocks.win, 'ready-to-show')()

    vi.useFakeTimers()
    listenerOn(mocks.win, 'close')(closeEvent())

    vi.advanceTimersByTime(6999)
    expect(mocks.win.close).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(mocks.win.close).toHaveBeenCalledOnce()
  })

  it('keeps the window open when the renderer reports a failed save', async () => {
    stubPlatform('win32')
    await importMain()
    listenerOn(mocks.win, 'ready-to-show')()

    vi.useFakeTimers()
    listenerOn(mocks.win, 'close')(closeEvent())
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    const cancelled = handlerFor('on', appCloseCancelledChannel)
    cancelled({ sender: mocks.win.webContents })
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(true)

    vi.advanceTimersByTime(60_000)
    expect(mocks.win.close).not.toHaveBeenCalled()

    const retry = closeEvent()
    listenerOn(mocks.win, 'close')(retry)
    expect(retry.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    const ready = handlerFor('on', appCloseReadyChannel)
    ready({ sender: mocks.win.webContents })
    expect(mocks.win.close).toHaveBeenCalledOnce()
  })

  it('keeps the close button disabled when a save settles while the window is closing', async () => {
    stubPlatform('win32')
    await importMain()
    listenerOn(mocks.win, 'ready-to-show')()

    let finishSave!: (document: unknown) => void
    mocks.database.saveDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    const request = handlerFor('handle', documentsSaveChannel)(
      { sender: mocks.win.webContents },
      1,
      { title: 'گزارش' },
    )
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    listenerOn(mocks.win, 'close')(closeEvent())
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    finishSave({
      id: 1,
      title: 'گزارش',
      body: '',
      createdAt: 1,
      updatedAt: 2,
    })
    await request
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    handlerFor(
      'on',
      appCloseCancelledChannel,
    )({
      sender: mocks.win.webContents,
    })
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(true)
  })

  it('closes after a save that was in flight when the window was asked to close', async () => {
    stubPlatform('win32')
    await importMain()
    listenerOn(mocks.win, 'ready-to-show')()

    let finishSave!: (document: unknown) => void
    mocks.database.saveDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )
    const request = handlerFor('handle', documentsSaveChannel)(
      { sender: mocks.win.webContents },
      1,
      { title: 'گزارش' },
    )
    listenerOn(mocks.win, 'close')(closeEvent())

    finishSave({
      id: 1,
      title: 'گزارش',
      body: '',
      createdAt: 1,
      updatedAt: 2,
    })
    await request

    handlerFor(
      'on',
      appCloseReadyChannel,
    )({
      sender: mocks.win.webContents,
    })

    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(true)
    expect(mocks.win.setClosable.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.win.close.mock.invocationCallOrder[0] ?? 0,
    )
    expect(mocks.win.close).toHaveBeenCalledOnce()
  })
})

describe('startup failures', () => {
  it('reports an unexpected startup failure and exits', async () => {
    stubPlatform('win32')
    mocks.BrowserWindow.mockImplementationOnce(function () {
      throw new Error('window creation failed')
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await importMain({ expectWindow: false })

      await vi.waitFor(() =>
        expect(mocks.dialog.showErrorBox).toHaveBeenCalledExactlyOnceWith(
          'WordApp',
          'آغاز برنامه ناموفق بود. برنامه بسته می شود.',
        ),
      )
      expect(mocks.app.exit).toHaveBeenCalledExactlyOnceWith(1)
      expect(consoleError).toHaveBeenCalledWith(
        'The app could not start: window creation failed',
      )
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('documents database', () => {
  it('reports a database that cannot be opened and quits without a window', async () => {
    stubPlatform('win32')
    mocks.openDatabase.mockImplementationOnce(() => {
      throw new Error('The database file is locked')
    })

    await importMain({ expectWindow: false })

    await vi.waitFor(() =>
      expect(mocks.dialog.showErrorBox).toHaveBeenCalledExactlyOnceWith(
        'WordApp',
        'پایگاه داده باز نشد. برنامه بسته می شود.',
      ),
    )
    expect(mocks.app.exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(mocks.created).toHaveLength(0)
  })

  it('opens the dev database inside the project folder when unpackaged', async () => {
    await importMain()

    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
  })

  it('opens the packaged database in the per-user app data folder', async () => {
    await importMain({ isPackaged: true })

    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/userdata', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
  })

  it('creates documents and answers lookups over their IPC channels', async () => {
    await importMain()
    const record = {
      id: 1,
      title: 'بدون عنوان',
      body: '',
      createdAt: 1,
      updatedAt: 1,
    }
    mocks.database.createDocument.mockReturnValue(record)
    mocks.database.getDocument.mockReturnValue(record)

    expect(handlerFor('handle', documentsCreateChannel)({})).toEqual(record)

    expect(handlerFor('handle', documentsGetChannel)({}, 1)).toEqual(record)
    expect(mocks.database.getDocument).toHaveBeenCalledWith(1)
  })

  it('ignores document lookups whose id is not a safe integer', async () => {
    await importMain()
    const get = handlerFor('handle', documentsGetChannel)

    expect(get({}, '1')).toBeUndefined()
    expect(get({}, 1.5)).toBeUndefined()
    expect(get({}, Number.NaN)).toBeUndefined()
    expect(mocks.database.getDocument).not.toHaveBeenCalled()
  })

  it('counts documents over IPC, optionally for a title search', async () => {
    await importMain()
    mocks.database.countDocuments.mockReturnValue(3)
    const count = handlerFor('handle', documentsCountChannel)

    await expect(count({}, { requestId: 'count-1' })).resolves.toBe(3)
    expect(mocks.database.countDocuments).toHaveBeenLastCalledWith(
      undefined,
      expect.any(AbortSignal),
    )

    await expect(
      count({}, { requestId: 'count-2', payload: '  گزارش  ' }),
    ).resolves.toBe(3)
    expect(mocks.database.countDocuments).toHaveBeenLastCalledWith(
      '  گزارش  ',
      expect.any(AbortSignal),
    )
    expect(count({}, { requestId: 'count-3', payload: 1 })).toBeUndefined()
    expect(count({}, { requestId: 'count-4', payload: null })).toBeUndefined()
    expect(count({}, { payload: 'گزارش' })).toBeUndefined()
    expect(count({}, { requestId: '', payload: 'گزارش' })).toBeUndefined()
    expect(count({}, { requestId: 1, payload: 'گزارش' })).toBeUndefined()
    expect(count({}, null)).toBeUndefined()
    expect(mocks.database.countDocuments).toHaveBeenCalledTimes(2)
  })

  it('lists a page of documents over IPC', async () => {
    await importMain()
    const page = [
      {
        id: 1,
        title: 'بدون عنوان',
        body: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    mocks.database.listDocuments.mockReturnValue(page)
    const list = handlerFor('handle', documentsListChannel)

    const oldest = { offset: 0, limit: 15, order: 'oldest' }
    await expect(
      list({}, { requestId: 'list-1', payload: oldest }),
    ).resolves.toEqual(page)
    expect(mocks.database.listDocuments).toHaveBeenCalledWith(
      oldest,
      expect.any(AbortSignal),
    )

    const newest = { offset: 30, limit: 15, order: 'newest' }
    await expect(
      list({}, { requestId: 'list-2', payload: newest }),
    ).resolves.toEqual(page)
    expect(mocks.database.listDocuments).toHaveBeenLastCalledWith(
      newest,
      expect.any(AbortSignal),
    )

    const filtered = {
      offset: 0,
      limit: 15,
      order: 'newest',
      search: 'گزارش',
    }
    await expect(
      list({}, { requestId: 'list-3', payload: filtered }),
    ).resolves.toEqual(page)
    expect(mocks.database.listDocuments).toHaveBeenLastCalledWith(
      filtered,
      expect.any(AbortSignal),
    )
  })

  it('ignores list calls without usable options', async () => {
    await importMain()
    const list = handlerFor('handle', documentsListChannel)
    const payload = { offset: 0, limit: 15 }

    expect(list({})).toBeUndefined()
    expect(list({}, undefined)).toBeUndefined()
    expect(list({}, null)).toBeUndefined()
    expect(list({}, 'list')).toBeUndefined()
    expect(list({}, { requestId: 'list' })).toBeUndefined()
    expect(list({}, { payload })).toBeUndefined()
    expect(list({}, { requestId: '', payload })).toBeUndefined()
    expect(list({}, { requestId: 1, payload })).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: 0 } }),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { limit: 15 } }),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: 0, limit: 0 } }),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: 0, limit: -1 } }),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: 0, limit: 1.5 } }),
    ).toBeUndefined()
    expect(
      list(
        {},
        { requestId: 'list', payload: { offset: 0, limit: Number.NaN } },
      ),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: 0, limit: '15' } }),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: -1, limit: 15 } }),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: 1.5, limit: 15 } }),
    ).toBeUndefined()
    expect(
      list(
        {},
        { requestId: 'list', payload: { offset: Number.NaN, limit: 15 } },
      ),
    ).toBeUndefined()
    expect(
      list({}, { requestId: 'list', payload: { offset: '0', limit: 15 } }),
    ).toBeUndefined()
    expect(
      list(
        {},
        {
          requestId: 'list',
          payload: { offset: 0, limit: 15, order: 'sideways' },
        },
      ),
    ).toBeUndefined()
    expect(
      list(
        {},
        { requestId: 'list', payload: { offset: 0, limit: 15, order: 1 } },
      ),
    ).toBeUndefined()
    expect(
      list(
        {},
        { requestId: 'list', payload: { offset: 0, limit: 15, order: null } },
      ),
    ).toBeUndefined()
    expect(
      list(
        {},
        { requestId: 'list', payload: { offset: 0, limit: 15, search: 1 } },
      ),
    ).toBeUndefined()
    expect(
      list(
        {},
        { requestId: 'list', payload: { offset: 0, limit: 15, search: null } },
      ),
    ).toBeUndefined()
    expect(mocks.database.listDocuments).not.toHaveBeenCalled()
  })

  it('aborts an in-flight document request when it is canceled', async () => {
    await importMain()
    let receivedSignal: AbortSignal | undefined
    mocks.database.listDocuments.mockImplementation(
      (_options: unknown, signal: AbortSignal) => {
        receivedSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason))
        })
      },
    )
    const list = handlerFor('handle', documentsListChannel)
    const request = list(
      {},
      { requestId: 'list-cancel', payload: { offset: 0, limit: 15 } },
    )

    expect(receivedSignal?.aborted).toBe(false)
    handlerFor('on', documentsCancelChannel)({}, 'list-cancel')
    expect(receivedSignal?.aborted).toBe(true)
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not start a document request that was canceled before it ran', async () => {
    await importMain()
    handlerFor('on', documentsCancelChannel)({}, 'early-list-cancel')

    const list = handlerFor('handle', documentsListChannel)

    await expect(
      list(
        {},
        {
          requestId: 'early-list-cancel',
          payload: { offset: 0, limit: 15 },
        },
      ),
    ).resolves.toBeUndefined()
    expect(mocks.database.listDocuments).not.toHaveBeenCalled()
  })

  it('deletes documents over IPC', async () => {
    await importMain()

    await expect(
      Promise.resolve(handlerFor('handle', documentsDeleteChannel)({}, 1)),
    ).resolves.toBeUndefined()
    expect(mocks.database.getDocument).toHaveBeenCalledWith(1)
    expect(mocks.database.deleteDocument).toHaveBeenCalledWith(1)
    expect(mocks.imageStore.removeDocument).toHaveBeenCalledWith(1, '')
  })

  it('removes the images the deleted document referenced', async () => {
    const fileName = '11111111-1111-4111-8111-111111111111.png'
    const body = `<img src="wordapp-image://image/${fileName}">`
    mocks.database.getDocument.mockResolvedValueOnce({
      id: 1,
      title: null,
      body,
      createdAt: 1,
      updatedAt: 1,
    })
    await importMain()

    await handlerFor('handle', documentsDeleteChannel)({}, 1)

    expect(mocks.imageStore.removeDocument).toHaveBeenCalledWith(1, body)
  })

  it('removes the images of every deleted document', async () => {
    const firstFileName = '11111111-1111-4111-8111-111111111111.png'
    const secondFileName = '22222222-2222-4222-8222-222222222222.jpg'
    const firstBody = `<img src="wordapp-image://image/${firstFileName}"><img src="wordapp-image://image/${secondFileName}">`
    const secondBody = `<img src="wordapp-image://image/${secondFileName}">`
    mocks.database.getDocument
      .mockResolvedValueOnce({
        id: 1,
        title: null,
        body: firstBody,
        createdAt: 1,
        updatedAt: 1,
      })
      .mockResolvedValueOnce({
        id: 2,
        title: null,
        body: secondBody,
        createdAt: 1,
        updatedAt: 1,
      })
    await importMain()

    await handlerFor('handle', documentsDeleteManyChannel)({}, [1, 2])

    expect(mocks.imageStore.removeDocument).toHaveBeenNthCalledWith(
      1,
      1,
      firstBody,
    )
    expect(mocks.imageStore.removeDocument).toHaveBeenNthCalledWith(
      2,
      2,
      secondBody,
    )
  })

  it('ignores delete calls whose id is not a safe integer', async () => {
    await importMain()
    const remove = handlerFor('handle', documentsDeleteChannel)

    expect(remove({}, '1')).toBeUndefined()
    expect(remove({}, 1.5)).toBeUndefined()
    expect(remove({}, Number.NaN)).toBeUndefined()
    expect(mocks.database.deleteDocument).not.toHaveBeenCalled()
  })

  it('deletes a batch of documents over IPC', async () => {
    await importMain()

    await expect(
      Promise.resolve(
        handlerFor('handle', documentsDeleteManyChannel)({}, [1, 2, 3]),
      ),
    ).resolves.toBeUndefined()
    expect(mocks.database.deleteDocuments).toHaveBeenCalledExactlyOnceWith([
      1, 2, 3,
    ])
  })

  it('ignores batch delete calls that are not a list of ids', async () => {
    await importMain()
    const removeMany = handlerFor('handle', documentsDeleteManyChannel)

    expect(removeMany({}, 1)).toBeUndefined()
    expect(removeMany({}, '1')).toBeUndefined()
    expect(removeMany({}, null)).toBeUndefined()
    expect(removeMany({}, undefined)).toBeUndefined()
    expect(removeMany({}, [1, '2'])).toBeUndefined()
    expect(removeMany({}, [1, 1.5])).toBeUndefined()
    expect(removeMany({}, [Number.NaN])).toBeUndefined()
    expect(mocks.database.deleteDocuments).not.toHaveBeenCalled()

    await Promise.resolve(removeMany({}, []))
    expect(mocks.database.deleteDocuments).toHaveBeenCalledExactlyOnceWith([])
  })

  it('saves document changes over IPC', async () => {
    await importMain()
    const record = {
      id: 1,
      title: 'گزارش',
      body: '',
      createdAt: 1,
      updatedAt: 2,
    }
    mocks.database.saveDocument.mockReturnValue(record)

    expect(
      handlerFor('handle', documentsSaveChannel)({}, 1, { title: 'گزارش' }),
    ).toEqual(record)
    expect(mocks.database.saveDocument).toHaveBeenCalledWith(1, {
      title: 'گزارش',
    })

    handlerFor('handle', documentsSaveChannel)({}, 1, { title: null })
    expect(mocks.database.saveDocument).toHaveBeenCalledWith(1, { title: null })
  })

  it('ignores save calls with a bad id or malformed changes', async () => {
    await importMain()
    const save = handlerFor('handle', documentsSaveChannel)

    expect(save({}, '1', { title: 'گزارش' })).toBeUndefined()
    expect(save({}, 1.5, { title: 'گزارش' })).toBeUndefined()
    expect(save({}, Number.NaN, { title: 'گزارش' })).toBeUndefined()
    expect(save({}, 1, undefined)).toBeUndefined()
    expect(save({}, 1, 'title')).toBeUndefined()
    expect(save({}, 1, { title: 7 })).toBeUndefined()
    expect(save({}, 1, { body: ['متن'] })).toBeUndefined()
    expect(mocks.database.saveDocument).not.toHaveBeenCalled()
    expect(mocks.win.setClosable).not.toHaveBeenCalled()

    save({}, 1, {})
    expect(mocks.database.saveDocument).toHaveBeenCalledWith(1, {})
  })

  it('disables the window close button while a document save is in flight', async () => {
    await importMain()
    const record = {
      id: 1,
      title: 'گزارش',
      body: '',
      createdAt: 1,
      updatedAt: 2,
    }
    let finishSave!: (document: unknown) => void
    mocks.database.saveDocument.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve
        }),
    )

    const request = handlerFor('handle', documentsSaveChannel)(
      { sender: mocks.win.webContents },
      1,
      { title: 'گزارش' },
    )

    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    finishSave(record)
    await expect(request).resolves.toEqual(record)
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(true)
  })

  it('keeps the close button disabled until every in-flight save settles', async () => {
    await importMain()
    const record = {
      id: 1,
      title: 'گزارش',
      body: '',
      createdAt: 1,
      updatedAt: 2,
    }
    const pendingSaves: Array<(document: unknown) => void> = []
    mocks.database.saveDocument
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            pendingSaves.push(resolve)
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            pendingSaves.push(resolve)
          }),
      )
    const save = handlerFor('handle', documentsSaveChannel)

    const first = save({ sender: mocks.win.webContents }, 1, {
      title: 'اول',
    })
    const second = save({ sender: mocks.win.webContents }, 2, {
      title: 'دوم',
    })

    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    pendingSaves[0](record)
    await first
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    pendingSaves[1](record)
    await second
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(true)
  })

  it('enables the close button again when a save fails', async () => {
    await importMain()
    mocks.database.saveDocument.mockRejectedValueOnce(new Error('save failed'))

    const request = handlerFor('handle', documentsSaveChannel)(
      { sender: mocks.win.webContents },
      1,
      { title: 'گزارش' },
    )

    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(false)

    await expect(request).rejects.toThrow('save failed')
    expect(mocks.win.setClosable).toHaveBeenLastCalledWith(true)
  })

  it('closes the database when the app is about to quit', async () => {
    await importMain()

    listenerOn(mocks.app, 'will-quit')()

    expect(mocks.database.close).toHaveBeenCalledOnce()
  })

  it('resets the dev database to the dev script seed before opening it', async () => {
    vi.stubEnv('DEV_SEED', 'documents,3')

    await importMain()

    expect(mocks.parseSeedArgument).toHaveBeenCalledWith('documents,3')
    expect(mocks.resetDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      [{ table: 'documents', count: 3 }],
    )
    expect(mocks.resetDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openDatabase.mock.invocationCallOrder[0],
    )
    expect(mocks.clearImageStore).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'images'),
    )
    expect(mocks.resetDatabase.mock.invocationCallOrder[0]).toBeLessThan(
      asMock(mocks.clearImageStore).mock.invocationCallOrder[0],
    )
    expect(
      asMock(mocks.clearImageStore).mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.openDatabase.mock.invocationCallOrder[0])
  })

  it('only empties the dev database and images when the dev script passed no seed', async () => {
    vi.stubEnv('DEV_SEED', '')

    await importMain()

    expect(mocks.parseSeedArgument).toHaveBeenCalledWith('')
    expect(mocks.resetDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      [],
    )
    expect(mocks.clearImageStore).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'images'),
    )
  })

  it('leaves the database and images alone when the dev script did not set a seed', async () => {
    await importMain()

    expect(mocks.resetDatabase).not.toHaveBeenCalled()
    expect(mocks.clearImageStore).not.toHaveBeenCalled()
  })

  it('ignores the dev seed and images in a packaged app', async () => {
    vi.stubEnv('DEV_SEED', 'documents,3')

    await importMain({ isPackaged: true })

    expect(mocks.resetDatabase).not.toHaveBeenCalled()
    expect(mocks.clearImageStore).not.toHaveBeenCalled()
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/userdata', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
    expect(mocks.createImageStore).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/userdata', 'images'),
    )
  })

  it('exits before opening the store when the seed cannot be applied', async () => {
    vi.stubEnv('DEV_SEED', 'users,50')
    mocks.resetDatabase.mockImplementationOnce(() => {
      throw new Error('Cannot seed table "users": no such table')
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await importMain({ expectWindow: false })

      await vi.waitFor(() => {
        expect(mocks.app.exit).toHaveBeenCalledWith(1)
      })
      expect(consoleError).toHaveBeenCalledWith(
        'The dev seed could not be applied: Cannot seed table "users": no such table',
      )
      expect(mocks.openDatabase).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('exits before opening the store when the dev images cannot be cleared', async () => {
    vi.stubEnv('DEV_SEED', 'documents,3')
    mocks.clearImageStore.mockRejectedValueOnce(new Error('busy'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await importMain({ expectWindow: false })

      await vi.waitFor(() => {
        expect(mocks.app.exit).toHaveBeenCalledWith(1)
      })
      expect(consoleError).toHaveBeenCalledWith(
        'The dev images could not be cleared: busy',
      )
      expect(mocks.openDatabase).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('slows every store operation by the dev script db delay', async () => {
    vi.stubEnv('DEV_DB_DELAY', '2000ms')

    await importMain()

    expect(mocks.parseDbDelayArgument).toHaveBeenCalledWith('2000ms')
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      { operationDelayMs: 2000, failingOperations: [] },
    )
  })

  it('keeps operations immediate when no db delay was passed', async () => {
    vi.stubEnv('DEV_DB_DELAY', '')

    await importMain()

    expect(mocks.parseDbDelayArgument).toHaveBeenCalledWith('')
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
  })

  it('ignores the dev db delay in a packaged app', async () => {
    vi.stubEnv('DEV_DB_DELAY', '2000ms')

    await importMain({ isPackaged: true })

    expect(mocks.parseDbDelayArgument).not.toHaveBeenCalled()
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/userdata', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
  })

  it('exits before opening the store when the db delay is invalid', async () => {
    vi.stubEnv('DEV_DB_DELAY', 'soon')
    mocks.parseDbDelayArgument.mockImplementationOnce(() => {
      throw new Error(
        'Invalid --db-delay "soon": the value must look like <milliseconds>ms, e.g. 2000ms',
      )
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await importMain({ expectWindow: false })

      await vi.waitFor(() => {
        expect(mocks.app.exit).toHaveBeenCalledWith(1)
      })
      expect(consoleError).toHaveBeenCalledWith(
        'The dev db delay could not be applied: Invalid --db-delay "soon": the value must look like <milliseconds>ms, e.g. 2000ms',
      )
      expect(mocks.openDatabase).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('fails the operations the --with-db-failure prompt picked', async () => {
    vi.stubEnv('DEV_DB_FAILURE', 'createDocument,getDocument,countDocuments')

    await importMain()

    expect(mocks.parseDbFailureArgument).toHaveBeenCalledWith(
      'createDocument,getDocument,countDocuments',
    )
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      {
        operationDelayMs: 0,
        failingOperations: ['createDocument', 'getDocument', 'countDocuments'],
      },
    )
  })

  it('fails nothing when the prompt picked nothing', async () => {
    vi.stubEnv('DEV_DB_FAILURE', '')

    await importMain()

    expect(mocks.parseDbFailureArgument).toHaveBeenCalledWith('')
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
  })

  it('fails nothing when the dev script did not send a selection', async () => {
    await importMain()

    expect(mocks.parseDbFailureArgument).not.toHaveBeenCalled()
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
  })

  it('ignores the dev db failure selection in a packaged app', async () => {
    vi.stubEnv('DEV_DB_FAILURE', 'createDocument')

    await importMain({ isPackaged: true })

    expect(mocks.parseDbFailureArgument).not.toHaveBeenCalled()
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/userdata', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
    )
  })

  it('exits before opening the store when the selection names an unknown operation', async () => {
    vi.stubEnv('DEV_DB_FAILURE', 'users')
    mocks.parseDbFailureArgument.mockImplementationOnce(() => {
      throw new Error(
        'Invalid --with-db-failure operation "users": valid operations are createDocument, getDocument, countDocuments, listDocuments, listMoreDocuments, deleteDocument, deleteDocuments, saveDocument',
      )
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await importMain({ expectWindow: false })

      await vi.waitFor(() => {
        expect(mocks.app.exit).toHaveBeenCalledWith(1)
      })
      expect(consoleError).toHaveBeenCalledWith(
        'The dev db failure could not be applied: Invalid --with-db-failure operation "users": valid operations are createDocument, getDocument, countDocuments, listDocuments, listMoreDocuments, deleteDocument, deleteDocuments, saveDocument',
      )
      expect(mocks.openDatabase).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })
})

describe('images', () => {
  const fileName = '11111111-1111-4111-8111-111111111111.png'
  const src = `wordapp-image://image/${fileName}`

  it('opens the image store and recovers its journal before the window', async () => {
    await importMain()

    expect(mocks.createImageStore).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'images'),
    )
    expect(mocks.imageStore.recover).toHaveBeenCalledOnce()
    expect(typeof mocks.imageStore.recover.mock.calls[0][0]).toBe('function')
    expect(mocks.createImageStore.mock.invocationCallOrder[0]).toBeLessThan(
      asMock(mocks.BrowserWindow).mock.invocationCallOrder[0],
    )
    expect(
      asMock(mocks.imageStore.recover).mock.invocationCallOrder[0],
    ).toBeLessThan(asMock(mocks.BrowserWindow).mock.invocationCallOrder[0])
  })

  it('keeps starting when the image journal cannot be recovered', async () => {
    mocks.imageStore.recover.mockRejectedValueOnce(new Error('bad journal'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await importMain()

      expect(consoleError).toHaveBeenCalledWith(
        'The image journal could not be recovered: bad journal',
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it('registers the image scheme and serves only stored file names', async () => {
    await importMain()

    expect(mocks.protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
      {
        scheme: 'wordapp-image',
        privileges: {
          standard: true,
          secure: true,
          supportFetchAPI: true,
          stream: true,
        },
      },
    ])

    const handler = mocks.protocol.handle.mock.calls.at(-1)?.[1] as
      ((request: { url: string }) => Promise<Response> | Response) | undefined

    expect(mocks.protocol.handle).toHaveBeenCalledWith(
      'wordapp-image',
      expect.any(Function),
    )
    expect(handler).toBeTypeOf('function')

    await handler?.({ url: src })
    expect(mocks.net.fetch).toHaveBeenCalledWith(
      pathToFileURL(
        path.join('C:/fake/wordapp', 'dev-data', 'images', fileName),
      ).toString(),
    )

    const missing = await handler?.({
      url: 'wordapp-image://image/../secret.png',
    })
    expect(missing?.status).toBe(404)
    expect(mocks.net.fetch).toHaveBeenCalledTimes(1)
  })

  it('stores an uploaded image through the bridge', async () => {
    await importMain()
    const request = {
      documentId: 7,
      name: 'photo.png',
      type: 'image/png',
      data: new Uint8Array([1, 2, 3]),
    }

    await expect(
      handlerFor('handle', imagesSaveChannel)({}, request),
    ).resolves.toEqual({
      src: 'wordapp-image://image/11111111-1111-4111-8111-111111111111.png',
    })
    expect(mocks.imageStore.save).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('ignores image uploads without a document or image bytes', async () => {
    await importMain()

    expect(
      handlerFor('handle', imagesSaveChannel)({}, { name: 'photo.png' }),
    ).toBeUndefined()
    expect(
      handlerFor('handle', imagesSaveChannel)(
        {},
        {
          documentId: 7,
          name: 'photo.png',
          type: 'image/png',
          data: new Uint8Array(),
        },
      ),
    ).toBeUndefined()
    expect(mocks.imageStore.save).not.toHaveBeenCalled()
  })

  it('copies a stored image through the bridge', async () => {
    await importMain()
    const request = { documentId: 7, src }

    await expect(
      handlerFor('handle', imagesCopyChannel)({}, request),
    ).resolves.toEqual({
      src: 'wordapp-image://image/33333333-3333-4333-8333-333333333333.png',
    })
    expect(mocks.imageStore.copy).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('ignores image copies that are not stored image sources', async () => {
    await importMain()

    expect(
      handlerFor('handle', imagesCopyChannel)(
        {},
        {
          documentId: 7,
          src: 'https://example.com/photo.png',
        },
      ),
    ).toBeUndefined()
    expect(mocks.imageStore.copy).not.toHaveBeenCalled()
  })

  it('removes a stored image and returns its bytes', async () => {
    await importMain()
    const request = { documentId: 7, src }

    const data = await handlerFor('handle', imagesRemoveChannel)({}, request)

    expect(new Uint8Array(data as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(mocks.imageStore.remove).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('answers image removals for other sources with no bytes', async () => {
    await importMain()

    expect(
      handlerFor('handle', imagesRemoveChannel)(
        {},
        {
          documentId: 7,
          src: 'https://example.com/photo.png',
        },
      ),
    ).toBeNull()
    expect(mocks.imageStore.remove).not.toHaveBeenCalled()
  })

  it('restores a stored image from its bytes', async () => {
    await importMain()
    const request = {
      documentId: 7,
      src,
      data: new Uint8Array([1, 2, 3]).buffer,
    }

    await expect(
      handlerFor('handle', imagesRestoreChannel)({}, request),
    ).resolves.toEqual({ src })
    expect(mocks.imageStore.restore).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('ignores image restores without bytes', async () => {
    await importMain()

    expect(
      handlerFor('handle', imagesRestoreChannel)(
        {},
        {
          documentId: 7,
          src,
        },
      ),
    ).toBeUndefined()
    expect(mocks.imageStore.restore).not.toHaveBeenCalled()
  })

  it('reconciles the image journal after a body save', async () => {
    await importMain()
    const request = {
      documentId: 7,
      savedBody: `<img src="${src}">`,
      currentBody: '<p>current</p>',
    }

    await expect(
      handlerFor('handle', imagesReconcileChannel)({}, request),
    ).resolves.toBeUndefined()
    expect(mocks.imageStore.reconcile).toHaveBeenCalledExactlyOnceWith(request)
  })

  it('ignores reconciliation requests without both bodies', async () => {
    await importMain()

    expect(
      handlerFor('handle', imagesReconcileChannel)(
        {},
        {
          documentId: 7,
          savedBody: '<p>saved</p>',
        },
      ),
    ).toBeUndefined()
    expect(mocks.imageStore.reconcile).not.toHaveBeenCalled()
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

    expect(mocks.win.loadURL).toHaveBeenCalledTimes(6)
    expect(mocks.win.show).not.toHaveBeenCalled()

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

  it('denies popups with non-https schemes without opening them', async () => {
    await importMain()

    const handler = asMock(mocks.win.webContents.setWindowOpenHandler).mock
      .calls[0]?.[0] as (details: { url: string }) => unknown

    for (const url of [
      'http://example.com',
      'file:///C:/Windows/notepad.exe',
      'javascript:alert(1)',
    ]) {
      expect(handler({ url })).toEqual({ action: 'deny' })
    }

    expect(mocks.shell.openExternal).not.toHaveBeenCalled()
  })

  it('keeps the window on the app page and opens safe external navigations in the browser', async () => {
    await importMain()

    const willNavigate = listenerOn(mocks.win.webContents, 'will-navigate')
    const event = { preventDefault: vi.fn() }

    willNavigate(event, mocks.win.webContents.getURL())
    expect(event.preventDefault).not.toHaveBeenCalled()

    willNavigate(event, 'https://example.com/docs')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.shell.openExternal).toHaveBeenCalledWith(
      'https://example.com/docs',
    )

    event.preventDefault.mockClear()
    willNavigate(event, 'file:///C:/Windows/notepad.exe')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(mocks.shell.openExternal).toHaveBeenCalledOnce()
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
