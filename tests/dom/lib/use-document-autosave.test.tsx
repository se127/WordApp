import { flushDocumentSaves } from '@/lib/close-handshake'
import { documentSaveDebounceMs } from '@/lib/document-save'
import { createQueryClient, documentQuery } from '@/lib/query'
import { useDocumentAutosave } from '@/lib/use-document-autosave'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const documentRecord: DocumentRecord = {
  id: 1,
  title: 'قبلی',
  body: '<p>قبلی</p>',
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
  }
}

function createWrapper(queryClient: ReturnType<typeof createQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

function renderAutosave(
  save: (
    id: number,
    changes: DocumentChanges,
  ) => Promise<DocumentRecord | undefined>,
) {
  installBridge(save)
  const queryClient = createQueryClient()
  const hook = renderHook(() => useDocumentAutosave(documentRecord), {
    wrapper: createWrapper(queryClient),
  })
  return { ...hook, queryClient }
}

async function advance(ms: number): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('useDocumentAutosave', () => {
  it('shares one debounce timer and saves title and body together after the last change', async () => {
    vi.useFakeTimers()
    const savedRecord: DocumentRecord = {
      ...documentRecord,
      title: 'گزارش',
      body: '<p>متن</p>',
      updatedAt: 2_000,
    }
    const save = vi.fn(async () => savedRecord)
    const { result } = renderAutosave(save)

    act(() => result.current.updateTitle('گزارش'))
    await advance(documentSaveDebounceMs - 200)
    act(() => result.current.updateBody('<p>متن</p>'))

    await advance(documentSaveDebounceMs - 1)
    expect(save).not.toHaveBeenCalled()

    await advance(1)
    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: '<p>متن</p>',
    })
    expect(result.current.title).toBe('گزارش')
  })

  it('stores an empty title as null while keeping the typed text for the input', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => ({
      ...documentRecord,
      ...changes,
      title: changes.title ?? null,
      updatedAt: 2_000,
    }))
    const { result } = renderAutosave(save)

    act(() => result.current.updateTitle('   '))
    await advance(documentSaveDebounceMs)

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: null,
      body: '<p>قبلی</p>',
    })
    expect(result.current.title).toBe('   ')
  })

  it('sends the unchanged title together with a body change', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => ({
      ...documentRecord,
      ...changes,
      updatedAt: 2_000,
    }))
    const { result } = renderAutosave(save)

    act(() => result.current.updateBody('<p>تازه</p>'))
    await advance(documentSaveDebounceMs)

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'قبلی',
      body: '<p>تازه</p>',
    })
  })

  it('flushes pending changes immediately instead of waiting for the debounce', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => ({
      ...documentRecord,
      ...changes,
      updatedAt: 2_000,
    }))
    const { result } = renderAutosave(save)

    act(() => result.current.updateTitle('گزارش'))
    await act(() => flushDocumentSaves())

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: '<p>قبلی</p>',
    })

    await advance(documentSaveDebounceMs)
    expect(save).toHaveBeenCalledOnce()
  })

  it('does not save again on unmount when the immediate flush failed', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {
      throw new Error(
        'The saveDocument operation failed (injected by --with-db-failure)',
      )
    })
    const { result, unmount } = renderAutosave(save)

    act(() => result.current.updateTitle('گزارش'))
    await act(() => flushDocumentSaves())

    expect(save).toHaveBeenCalledOnce()

    unmount()
    await advance(0)

    expect(save).toHaveBeenCalledOnce()
  })

  it('saves pending changes on unmount when the debounce has not fired', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => ({
      ...documentRecord,
      ...changes,
      updatedAt: 2_000,
    }))
    const { result, unmount } = renderAutosave(save)

    act(() => result.current.updateTitle('گزارش'))
    unmount()
    await advance(0)

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: '<p>قبلی</p>',
    })
  })

  it('pauses autosave and resumes pending changes after a failed delete', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => ({
      ...documentRecord,
      ...changes,
      updatedAt: 2_000,
    }))
    const { result } = renderAutosave(save)

    act(() => result.current.updateTitle('گزارش'))
    act(() => result.current.pauseAutosave())
    await advance(documentSaveDebounceMs)

    expect(save).not.toHaveBeenCalled()

    act(() => result.current.resumeAutosave())
    await advance(documentSaveDebounceMs)

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: '<p>قبلی</p>',
    })
  })

  it('ignores a save that finishes while autosave is paused', async () => {
    vi.useFakeTimers()
    let finishSave!: (document: DocumentRecord) => void
    const save = vi.fn(
      () =>
        new Promise<DocumentRecord>((resolve) => {
          finishSave = resolve
        }),
    )
    const { result, queryClient } = renderAutosave(save)

    act(() => result.current.updateTitle('گزارش'))
    await advance(documentSaveDebounceMs)
    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: '<p>قبلی</p>',
    })

    act(() => result.current.pauseAutosave())
    await act(async () => {
      finishSave({
        ...documentRecord,
        title: 'گزارش',
        updatedAt: 2_000,
      })
      await Promise.resolve()
    })

    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toBeUndefined()
  })
})
