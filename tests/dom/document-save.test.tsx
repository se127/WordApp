import { documentSaveTimeoutMs, useDocumentSave } from '@/lib/document-save'
import { createQueryClient, documentQuery } from '@/lib/query'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const documentRecord: DocumentRecord = {
  id: 1,
  title: 'بدون عنوان',
  body: '',
  createdAt: 1_000,
  updatedAt: 1_000,
}

function installBridge(
  save: (
    id: number,
    changes: DocumentChanges,
  ) => Promise<DocumentRecord | undefined>,
) {
  window.WordApp = {
    platform: 'win32',
    lifecycle: {
      onBeforeClose: vi.fn(() => () => {}),
      closeReady: vi.fn(),
      closeCancelled: vi.fn(),
    },
    documents: {
      create: vi.fn(async () => documentRecord),
      get: vi.fn(async () => documentRecord),
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [documentRecord]),
      cancel: vi.fn(),
      delete: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => undefined),
      save,
    },
    images: {
      save: vi.fn(async () => ({
        src: 'wordapp-image://image/11111111-1111-4111-8111-111111111111.png',
      })),
      copy: vi.fn(async () => ({
        src: 'wordapp-image://image/33333333-3333-4333-8333-333333333333.png',
      })),
      collect: vi.fn(async () => {}),
    },
  }
}

function createWrapper(queryClient: ReturnType<typeof createQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('useDocumentSave', () => {
  it('keeps a newer cached title when a body save response carries the older title', async () => {
    const save = vi.fn(async (): Promise<DocumentRecord | undefined> => ({
      ...documentRecord,
      body: '<p>متن</p>',
      updatedAt: 3_000,
    }))
    installBridge(save)
    const queryClient = createQueryClient()
    queryClient.setQueryData<DocumentRecord | null>(
      documentQuery(1).queryKey,
      () => ({
        ...documentRecord,
        title: 'گزارش',
        updatedAt: 2_000,
      }),
    )

    const { result } = renderHook(() => useDocumentSave(1), {
      wrapper: createWrapper(queryClient),
    })

    await act(() => result.current({ body: '<p>متن</p>' }))

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      body: '<p>متن</p>',
    })
    expect(
      queryClient.getQueryData<DocumentRecord | null>(
        documentQuery(1).queryKey,
      ),
    ).toEqual({
      ...documentRecord,
      title: 'گزارش',
      body: '<p>متن</p>',
      updatedAt: 3_000,
    })
  })

  it('clears the cached title when a null title save resolves', async () => {
    const save = vi.fn(async (): Promise<DocumentRecord | undefined> => ({
      ...documentRecord,
      title: null,
      updatedAt: 3_000,
    }))
    installBridge(save)
    const queryClient = createQueryClient()
    queryClient.setQueryData<DocumentRecord | null>(
      documentQuery(1).queryKey,
      () => ({
        ...documentRecord,
        title: 'گزارش',
        updatedAt: 2_000,
      }),
    )

    const { result } = renderHook(() => useDocumentSave(1), {
      wrapper: createWrapper(queryClient),
    })

    await act(() => result.current({ title: null }))

    expect(save).toHaveBeenCalledExactlyOnceWith(1, { title: null })
    expect(
      queryClient.getQueryData<DocumentRecord | null>(
        documentQuery(1).queryKey,
      ),
    ).toEqual({
      ...documentRecord,
      title: null,
      updatedAt: 3_000,
    })
  })

  it('keeps a newer cached body when a title save response carries the older body', async () => {
    const save = vi.fn(async (): Promise<DocumentRecord | undefined> => ({
      ...documentRecord,
      title: 'گزارش',
      updatedAt: 3_000,
    }))
    installBridge(save)
    const queryClient = createQueryClient()
    queryClient.setQueryData<DocumentRecord | null>(
      documentQuery(1).queryKey,
      () => ({
        ...documentRecord,
        body: '<p>متن تازه</p>',
        updatedAt: 4_000,
      }),
    )

    const { result } = renderHook(() => useDocumentSave(1), {
      wrapper: createWrapper(queryClient),
    })

    await act(() => result.current({ title: 'گزارش' }))

    expect(
      queryClient.getQueryData<DocumentRecord | null>(
        documentQuery(1).queryKey,
      ),
    ).toEqual({
      ...documentRecord,
      title: 'گزارش',
      body: '<p>متن تازه</p>',
      updatedAt: 4_000,
    })
  })

  it('stops waiting for a save that does not settle within the timeout', async () => {
    vi.useFakeTimers()
    const save = vi.fn(
      () => new Promise<DocumentRecord | undefined>(() => undefined),
    )
    installBridge(save)
    const queryClient = createQueryClient()
    const { result } = renderHook(() => useDocumentSave(1), {
      wrapper: createWrapper(queryClient),
    })

    let outcome!: Promise<boolean>
    act(() => {
      outcome = result.current({ title: 'گزارش' })
    })

    await act(() => vi.advanceTimersByTimeAsync(documentSaveTimeoutMs))
    await expect(outcome).resolves.toBe(false)
  })

  it('ignores a save that finishes while the document is suspended', async () => {
    let finishSave!: (document: DocumentRecord) => void
    const save = vi.fn(
      () =>
        new Promise<DocumentRecord | undefined>((resolve) => {
          finishSave = resolve
        }),
    )
    installBridge(save)
    const queryClient = createQueryClient()
    queryClient.setQueryData<DocumentRecord | null>(
      documentQuery(1).queryKey,
      () => documentRecord,
    )

    const { result } = renderHook(() => useDocumentSave(1), {
      wrapper: createWrapper(queryClient),
    })

    let isSuspended = false
    let outcome!: Promise<boolean>
    act(() => {
      outcome = result.current({ title: 'گزارش' }, () => isSuspended)
    })
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())

    isSuspended = true
    await act(async () => {
      finishSave({
        ...documentRecord,
        title: 'گزارش',
        updatedAt: 2_000,
      })
      await Promise.resolve()
    })

    await expect(outcome).resolves.toBe(false)
    expect(
      queryClient.getQueryData<DocumentRecord | null>(
        documentQuery(1).queryKey,
      ),
    ).toEqual(documentRecord)
  })
})
