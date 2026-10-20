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
  documentsCancelChannel,
  documentsCountChannel,
  documentsCreateChannel,
  documentsDeleteChannel,
  documentsDeleteManyChannel,
  documentsGetChannel,
  documentsListChannel,
  documentsSaveChannel,
} from '../../electron/ipc.ts'

const mocks = vi.hoisted(() => {
  const win = {
    isDestroyed: vi.fn(() => false),
    maximize: vi.fn(),
    show: vi.fn(),
    loadURL: vi.fn(async () => {}),
    loadFile: vi.fn(async () => {}),
    on: vi.fn(),
    once: vi.fn(),
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
  }

  return {
    BrowserWindow,
    Menu: { setApplicationMenu: vi.fn() },
    app,
    created,
    database,
    ipcMain: { on: vi.fn(), handle: vi.fn() },
    openDatabase: vi.fn(() => database),
    parseDbDelayArgument,
    parseDbFailureArgument,
    parseSeedArgument,
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
  ipcMain: mocks.ipcMain,
  Menu: mocks.Menu,
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
  mocks.win.isDestroyed.mockReturnValue(false)
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

describe('documents database', () => {
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

    expect(handlerFor('handle', documentsDeleteChannel)({}, 1)).toBeUndefined()
    expect(mocks.database.deleteDocument).toHaveBeenCalledWith(1)
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

    expect(
      handlerFor('handle', documentsDeleteManyChannel)({}, [1, 2, 3]),
    ).toBeUndefined()
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

    removeMany({}, [])
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

    save({}, 1, {})
    expect(mocks.database.saveDocument).toHaveBeenCalledWith(1, {})
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
  })

  it('only empties the dev database when the dev script passed no seed', async () => {
    vi.stubEnv('DEV_SEED', '')

    await importMain()

    expect(mocks.parseSeedArgument).toHaveBeenCalledWith('')
    expect(mocks.resetDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/wordapp', 'dev-data', 'db.sqlite'),
      [],
    )
  })

  it('leaves the database alone when the dev script did not set a seed', async () => {
    await importMain()

    expect(mocks.resetDatabase).not.toHaveBeenCalled()
  })

  it('ignores the dev seed in a packaged app', async () => {
    vi.stubEnv('DEV_SEED', 'documents,3')

    await importMain({ isPackaged: true })

    expect(mocks.resetDatabase).not.toHaveBeenCalled()
    expect(mocks.openDatabase).toHaveBeenCalledExactlyOnceWith(
      path.join('C:/fake/userdata', 'db.sqlite'),
      { operationDelayMs: 0, failingOperations: [] },
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
