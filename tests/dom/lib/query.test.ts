import {
  createQueryClient,
  documentsCountQuery,
  documentsQuery,
  documentPageSize,
  documentQuery,
  invalidateDocumentPagesFrom,
} from '@/lib/query'
import { keepPreviousData } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

type WordAppBridge = Window['WordApp']

const storedDocument = {
  id: 4,
  title: 'گزارش',
  body: 'متن',
  createdAt: 2_000,
  updatedAt: 2_000,
}

function installDocuments(
  documents: Partial<WordAppBridge['documents']> = {},
): void {
  window.WordApp = {
    platform: 'win32',
    documents: {
      create: vi.fn(async () => storedDocument),
      get: vi.fn(async () => storedDocument),
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [storedDocument]),
      delete: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      ...documents,
    },
    windowControls: {
      minimize: vi.fn(async () => {}),
      toggleMaximize: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn(() => () => {}),
    },
  } satisfies WordAppBridge
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('query layer', () => {
  it('never retries, never refetches on its own, and keeps the zero client stale time', () => {
    const queries = createQueryClient().getDefaultOptions().queries

    expect(queries?.retry).toBe(0)
    expect(queries?.retryOnMount).toBe(false)
    expect(queries?.refetchOnMount).toBe(false)
    expect(queries?.refetchOnWindowFocus).toBe(false)
    expect(queries?.refetchOnReconnect).toBe(false)
    expect(queries?.staleTime).toBeUndefined()
  })

  it('keeps each query fresh until a write invalidates it', async () => {
    expect(documentsCountQuery.staleTime).toBe(Infinity)
    expect(documentsQuery(1).staleTime).toBe(Infinity)
    expect(documentQuery(1).staleTime).toBe(Infinity)

    const get = vi.fn(async () => storedDocument)
    installDocuments({ get })
    const client = createQueryClient()

    await client.query(documentQuery(4))
    await client.query(documentQuery(4))
    expect(get).toHaveBeenCalledOnce()

    await client.invalidateQueries({ queryKey: documentQuery(4).queryKey })
    await client.query(documentQuery(4))
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('reads the documents count through the preload bridge', async () => {
    const count = vi.fn(async () => 7)
    installDocuments({ count })

    await expect(createQueryClient().query(documentsCountQuery)).resolves.toBe(
      7,
    )
    expect(count).toHaveBeenCalledOnce()
  })

  it('reads a page of documents through the preload bridge', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })

    await expect(createQueryClient().query(documentsQuery(2))).resolves.toEqual(
      [storedDocument],
    )
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith({
      offset: documentPageSize,
      limit: documentPageSize,
      order: 'newest',
    })
  })

  it('reads the oldest documents first when asked', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })

    await expect(
      createQueryClient().query(documentsQuery(1, 'oldest')),
    ).resolves.toEqual([storedDocument])
    expect(list).toHaveBeenCalledWith({
      offset: 0,
      limit: documentPageSize,
      order: 'oldest',
    })
  })

  it('keeps the previous page on screen while the next page loads', () => {
    expect(documentsQuery(1).placeholderData).toBe(keepPreviousData)
    expect(documentsQuery(1).refetchOnMount).toBe(true)
    expect(documentPageSize).toBe(15)
  })

  it('invalidates the cached pages from the given page onward', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })
    const client = createQueryClient()

    await client.query(documentsQuery(1))
    await client.query(documentsQuery(2))
    await client.query(documentsQuery(3))

    invalidateDocumentPagesFrom(client, 2)

    expect(
      client.getQueryState(documentsQuery(1).queryKey)?.isInvalidated,
    ).toBe(false)
    expect(
      client.getQueryState(documentsQuery(2).queryKey)?.isInvalidated,
    ).toBe(true)
    expect(
      client.getQueryState(documentsQuery(3).queryKey)?.isInvalidated,
    ).toBe(true)
    expect(list).toHaveBeenCalledTimes(3)

    await client.query(documentsQuery(3))
    expect(list).toHaveBeenCalledTimes(4)
  })

  it('resolves a missing preload bridge to null instead of throwing', async () => {
    await expect(
      createQueryClient().query(documentsCountQuery),
    ).resolves.toBeNull()
    await expect(
      createQueryClient().query(documentsQuery(1)),
    ).resolves.toBeNull()
    await expect(
      createQueryClient().query(documentQuery(1)),
    ).resolves.toBeNull()
  })

  it('reads one document through the preload bridge', async () => {
    const get = vi.fn(async () => storedDocument)
    installDocuments({ get })

    await expect(createQueryClient().query(documentQuery(4))).resolves.toEqual(
      storedDocument,
    )
    expect(get).toHaveBeenCalledWith(4)
  })
})
