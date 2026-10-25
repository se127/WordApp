import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
    send: mocks.send,
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
    expect(typeof api.clipboard.read).toBe('function')
    expect(typeof api.clipboard.write).toBe('function')
    expect(typeof api.documents.create).toBe('function')
    expect(typeof api.documents.get).toBe('function')
    expect(typeof api.documents.count).toBe('function')
    expect(typeof api.documents.list).toBe('function')
    expect(typeof api.documents.cancel).toBe('function')
    expect(typeof api.documents.delete).toBe('function')
    expect(typeof api.documents.deleteMany).toBe('function')
    expect(typeof api.documents.save).toBe('function')
    expect(typeof api.images.save).toBe('function')
    expect(typeof api.images.copy).toBe('function')
    expect(typeof api.images.collect).toBe('function')
  })

  it('forwards clipboard calls over the clipboard channels', async () => {
    const content = { text: 'متن', html: '<p>متن</p>', image: null }
    mocks.invoke.mockResolvedValue(content)
    const api = await importPreload()

    await expect(api.clipboard.read()).resolves.toEqual(content)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:app:clipboard-read')

    await api.clipboard.write({ text: 'متن', html: '<p>متن</p>' })
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:app:clipboard-write', {
      text: 'متن',
      html: '<p>متن</p>',
    })
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
    await expect(api.documents.count(undefined, 'count-1')).resolves.toBe(5)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:count', {
      requestId: 'count-1',
      payload: undefined,
    })

    await expect(api.documents.count('گزارش', 'count-2')).resolves.toBe(5)
    expect(mocks.invoke).toHaveBeenLastCalledWith('wordapp:documents:count', {
      requestId: 'count-2',
      payload: 'گزارش',
    })

    const page = [record]
    mocks.invoke.mockResolvedValue(page)
    await expect(
      api.documents.list({ offset: 15, limit: 15, order: 'oldest' }, 'list-1'),
    ).resolves.toEqual(page)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:list', {
      requestId: 'list-1',
      payload: {
        offset: 15,
        limit: 15,
        order: 'oldest',
      },
    })

    await expect(
      api.documents.list(
        {
          offset: 0,
          limit: 15,
          order: 'newest',
          search: 'گزارش',
        },
        'list-2',
      ),
    ).resolves.toEqual(page)
    expect(mocks.invoke).toHaveBeenLastCalledWith('wordapp:documents:list', {
      requestId: 'list-2',
      payload: {
        offset: 0,
        limit: 15,
        order: 'newest',
        search: 'گزارش',
      },
    })

    mocks.invoke.mockResolvedValue(undefined)
    await expect(api.documents.delete(7)).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:delete', 7)

    await expect(api.documents.deleteMany([7, 8])).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledWith(
      'wordapp:documents:delete-many',
      [7, 8],
    )

    mocks.invoke.mockResolvedValue(record)
    await expect(api.documents.save(7, { title: 'گزارش' })).resolves.toEqual(
      record,
    )
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:documents:save', 7, {
      title: 'گزارش',
    })
  })

  it('forwards image calls over the image channels', async () => {
    const saved = { src: 'wordapp-image://image/7/stored.png' }
    const src = 'wordapp-image://image/7/stored.png'
    const data = new Uint8Array([1, 2, 3]).buffer
    mocks.invoke.mockResolvedValue(saved)
    const api = await importPreload()
    const request = {
      documentId: 7,
      name: 'photo.png',
      type: 'image/png',
      data,
    }

    await expect(api.images.save(request)).resolves.toEqual(saved)
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:images:save', request)

    await expect(api.images.copy({ documentId: 7, src })).resolves.toEqual(
      saved,
    )
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:images:copy', {
      documentId: 7,
      src,
    })

    const collect = {
      documentId: 7,
      savedBody: '<p>saved</p>',
      currentBody: '<p>current</p>',
    }
    mocks.invoke.mockResolvedValue(undefined)
    await expect(api.images.collect(collect)).resolves.toBeUndefined()
    expect(mocks.invoke).toHaveBeenCalledWith('wordapp:images:collect', collect)
  })

  it('forwards request cancellation over the cancellation channel', async () => {
    const api = await importPreload()

    api.documents.cancel('list-1')

    expect(mocks.send).toHaveBeenCalledWith(
      'wordapp:documents:cancel',
      'list-1',
    )
  })

  it('forwards the close handshake over the app lifecycle channels', async () => {
    const api = await importPreload()
    const listener = vi.fn()

    const unsubscribe = api.lifecycle.onBeforeClose(listener)
    const handler = mocks.on.mock.calls.at(-1)?.[1] as (() => void) | undefined

    expect(mocks.on).toHaveBeenCalledWith(
      'wordapp:app:before-close',
      expect.any(Function),
    )
    expect(handler).toBeTypeOf('function')

    handler?.()
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    expect(mocks.removeListener).toHaveBeenCalledWith(
      'wordapp:app:before-close',
      handler,
    )

    api.lifecycle.closeReady()
    expect(mocks.send).toHaveBeenCalledWith('wordapp:app:close-ready')

    api.lifecycle.closeCancelled()
    expect(mocks.send).toHaveBeenCalledWith('wordapp:app:close-cancelled')
  })
})
