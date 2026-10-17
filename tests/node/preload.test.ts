import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}))

type ExposedApi = Window['WordApp']

async function importPreload(): Promise<ExposedApi> {
  vi.resetModules()
  await import('../../electron/preload.ts')

  const call = mocks.expose.mock.calls.at(-1)
  expect(call?.[0]).toBe('WordApp')
  return (call?.[1] ?? {}) as ExposedApi
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('preload bridge', () => {
  it('exposes the WordApp API with the platform and the document calls', async () => {
    const api = await importPreload()

    expect(api.platform).toBe(process.platform)
    expect(typeof api.documents.create).toBe('function')
    expect(typeof api.documents.get).toBe('function')
    expect(typeof api.documents.count).toBe('function')
    expect(typeof api.documents.list).toBe('function')
    expect(typeof api.documents.delete).toBe('function')
    expect(typeof api.documents.save).toBe('function')
    expect(typeof api.windowControls.minimize).toBe('function')
    expect(typeof api.windowControls.toggleMaximize).toBe('function')
    expect(typeof api.windowControls.close).toBe('function')
    expect(typeof api.windowControls.isMaximized).toBe('function')
    expect(typeof api.windowControls.onMaximizedChange).toBe('function')
  })

  it('forwards document calls over the document channels', async () => {
    const record = {
      id: 7,
      title: 'بدون عنوان',
      body: '',
      createdAt: 1,
      updatedAt: 1,
    }
    mocks.invoke.mockResolvedValue(record)
    const api = await importPreload()

    await expect(api.documents.create()).resolves.toEqual(record)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:create')

    await expect(api.documents.get(7)).resolves.toEqual(record)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:get', 7)

    mocks.invoke.mockResolvedValue(5)
    await expect(api.documents.count()).resolves.toBe(5)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:count')

    mocks.invoke.mockResolvedValue([record])
    await expect(api.documents.list()).resolves.toEqual([record])
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:list')

    mocks.invoke.mockResolvedValue(undefined)
    await expect(api.documents.delete(7)).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:delete', 7)

    mocks.invoke.mockResolvedValue(record)
    await expect(api.documents.save(7, { title: 'گزارش' })).resolves.toEqual(
      record,
    )
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:save', 7, {
      title: 'گزارش',
    })
  })

  it('forwards window control calls over the window channels', async () => {
    const api = await importPreload()

    mocks.invoke.mockResolvedValue(undefined)
    await expect(api.windowControls.minimize()).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:window:minimize')

    await expect(api.windowControls.toggleMaximize()).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:window:toggle-maximize')

    await expect(api.windowControls.close()).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:window:close')

    mocks.invoke.mockResolvedValue(true)
    await expect(api.windowControls.isMaximized()).resolves.toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:window:is-maximized')
  })

  it('reports maximize changes to its subscriber and stops on request', async () => {
    const api = await importPreload()
    const callback = vi.fn()

    const unsubscribe = api.windowControls.onMaximizedChange(callback)

    expect(mocks.on).toHaveBeenCalledOnce()
    const [channel, listener] = mocks.on.mock.calls[0] as [
      string,
      (event: unknown, isMaximized: boolean) => void,
    ]
    expect(channel).toBe('wordapp:window:maximized-changed')

    listener({}, true)
    expect(callback).toHaveBeenCalledExactlyOnceWith(true)

    listener({}, false)
    expect(callback).toHaveBeenLastCalledWith(false)

    unsubscribe()
    expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(
      channel,
      listener,
    )
  })
})
