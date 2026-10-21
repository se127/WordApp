import {
  createQueryClient,
  documentsCountQuery,
  documentsCountQueryFor,
  documentsQuery,
  documentsQueryKey,
  documentPageSize,
  documentQuery,
} from '@/lib/query'
import { keepPreviousData, onlineManager } from '@tanstack/react-query'
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
    lifecycle: {
      onBeforeClose: vi.fn(() => () => {}),
      closeReady: vi.fn(),
      closeCancelled: vi.fn(),
    },
    documents: {
      create: vi.fn(async () => storedDocument),
      get: vi.fn(async () => storedDocument),
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [storedDocument]),
      cancel: vi.fn(),
      delete: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
      ...documents,
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
    expect(queries?.networkMode).toBe('always')
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
    expect(count).toHaveBeenCalledWith(undefined, expect.any(String))
  })

  it('reads a filtered count through the preload bridge', async () => {
    const count = vi.fn(async () => 2)
    installDocuments({ count })

    await expect(
      createQueryClient().query(documentsCountQueryFor('  گزارش  ')),
    ).resolves.toBe(2)
    expect(count).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledWith('گزارش', expect.any(String))
    expect(documentsCountQueryFor('')).toBe(documentsCountQuery)
    expect(documentsCountQueryFor('گزارش').placeholderData).toBe(
      keepPreviousData,
    )
  })

  it('reads a page of documents through the preload bridge', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })

    await expect(createQueryClient().query(documentsQuery(2))).resolves.toEqual(
      [storedDocument],
    )
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith(
      {
        offset: documentPageSize,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
  })

  it('reads a filtered page through the preload bridge', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })

    await expect(
      createQueryClient().query(documentsQuery(2, 'oldest', '  گزارش  ')),
    ).resolves.toEqual([storedDocument])
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith(
      {
        offset: documentPageSize,
        limit: documentPageSize,
        order: 'oldest',
        search: 'گزارش',
      },
      expect.any(String),
    )
    expect(documentsQuery(2, 'oldest', '  گزارش  ').queryKey).toEqual([
      ...documentsQuery(2, 'oldest').queryKey,
      'گزارش',
    ])
  })

  it('reads the oldest documents first when asked', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })

    await expect(
      createQueryClient().query(documentsQuery(1, 'oldest')),
    ).resolves.toEqual([storedDocument])
    expect(list).toHaveBeenCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'oldest',
      },
      expect.any(String),
    )
  })

  it('keeps the previous page on screen while the next page loads', () => {
    expect(documentsQuery(1).placeholderData).toBe(keepPreviousData)
    expect(documentsQuery(1).refetchOnMount).toBe(true)
    expect(documentPageSize).toBe(15)
  })

  it('invalidates every cached list combination so a delete cannot leave one stale', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })
    const client = createQueryClient()

    const pages = [
      documentsQuery(1),
      documentsQuery(2),
      documentsQuery(1, 'oldest'),
      documentsQuery(1, 'newest', 'گزارش'),
    ]
    await client.query(documentsCountQuery)
    for (const page of pages) {
      await client.query(page)
    }

    await client.invalidateQueries({ queryKey: documentsQueryKey })

    for (const page of pages) {
      expect(client.getQueryState(page.queryKey)?.isInvalidated).toBe(true)
    }
    expect(
      client.getQueryState(documentsCountQuery.queryKey)?.isInvalidated,
    ).toBe(false)

    await client.query(documentsQuery(1))
    expect(list).toHaveBeenCalledTimes(pages.length + 1)
  })

  it('reads while the online manager reports an offline machine', async () => {
    const list = vi.fn(async () => [storedDocument])
    installDocuments({ list })
    onlineManager.setOnline(false)

    try {
      await expect(
        createQueryClient().query(documentsQuery(1)),
      ).resolves.toEqual([storedDocument])
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('cancels the preload read when its query is canceled', async () => {
    let requestId: string | undefined
    let rejectRead: ((reason?: unknown) => void) | undefined
    const list: WordAppBridge['documents']['list'] = (_options, id) => {
      requestId = id
      return new Promise((_resolve, reject) => {
        rejectRead = reject
      })
    }
    const cancel = vi.fn((id: string) => {
      if (id === requestId) {
        rejectRead?.(new DOMException('The read was aborted', 'AbortError'))
      }
    })
    installDocuments({ list, cancel })
    const client = createQueryClient()
    const request = client.fetchQuery(documentsQuery(1)).catch(() => undefined)

    await vi.waitFor(() => expect(requestId).toBeDefined())
    await client.cancelQueries({ queryKey: documentsQuery(1).queryKey })

    expect(cancel).toHaveBeenCalledWith(requestId)
    await request
    expect(client.getQueryState(documentsQuery(1).queryKey)?.fetchStatus).toBe(
      'idle',
    )
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
