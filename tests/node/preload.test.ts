import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: {
    send: mocks.send,
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}))

// The bridge contract the renderer sees; mirrors the Window.WordApp type in
// src/types/global.d.ts.
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
  it('exposes the WordApp API with the platform and every control', async () => {
    const api = await importPreload()

    expect(api.platform).toBe(process.platform)
    expect(typeof api.windowControls.close).toBe('function')
    expect(typeof api.windowControls.minimize).toBe('function')
    expect(typeof api.windowControls.toggleMaximize).toBe('function')
    expect(typeof api.windowControls.isMaximized).toBe('function')
    expect(typeof api.windowControls.onMaximizedChange).toBe('function')
    expect(typeof api.documents.create).toBe('function')
    expect(typeof api.documents.get).toBe('function')
    expect(typeof api.documents.count).toBe('function')
  })

  it('sends each caption-button channel', async () => {
    const api = await importPreload()

    api.windowControls.close()
    api.windowControls.minimize()
    api.windowControls.toggleMaximize()

    expect(mocks.send).toHaveBeenCalledWith('wordapp:window:close')
    expect(mocks.send).toHaveBeenCalledWith('wordapp:window:minimize')
    expect(mocks.send).toHaveBeenCalledWith('wordapp:window:toggle-maximize')
  })

  it('queries the maximized state over the invoke channel', async () => {
    mocks.invoke.mockResolvedValue(true)
    const api = await importPreload()

    await expect(api.windowControls.isMaximized()).resolves.toBe(true)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:window:is-maximized')
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
  })

  it('forwards maximize changes and unsubscribes on demand', async () => {
    const api = await importPreload()
    const callback = vi.fn()

    const unsubscribe = api.windowControls.onMaximizedChange(callback)

    const [channel, listener] = mocks.on.mock.calls.at(-1) as [
      string,
      (event: unknown, maximized: boolean) => void,
    ]
    expect(channel).toBe('wordapp:window:maximized-changed')

    listener({}, true)
    expect(callback).toHaveBeenCalledExactlyOnceWith(true)

    unsubscribe()
    expect(mocks.removeListener).toHaveBeenCalledWith(channel, listener)
  })
})
