import {
  forgetDocumentChanges,
  rememberedDocumentChanges,
  rememberDocumentChanges,
  retryRememberedDocumentChanges,
} from '@/lib/document-recovery'
import { hasDocumentSaveFailed } from '@/lib/document-save-state'
import { createQueryClient, documentQuery } from '@/lib/query'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import { fireEvent, render } from '@testing-library/react'
import { isValidElement } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

const documentRecord: DocumentRecord = {
  id: 1,
  title: 'قبلی',
  body: '<p>قبلی</p>',
  createdAt: 1_000,
  updatedAt: 1_000,
}

const savedRecord: DocumentRecord = {
  ...documentRecord,
  title: 'گزارش',
  body: '<p>تازه</p>',
  updatedAt: 2_000,
}

function installBridge(
  save: (
    id: number,
    changes: DocumentChanges,
  ) => Promise<DocumentRecord | undefined>,
  get: (id: number) => Promise<DocumentRecord | undefined>,
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
      get,
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

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('document recovery', () => {
  it('keeps the newest remembered changes per query client', () => {
    const queryClient = createQueryClient()
    const otherQueryClient = createQueryClient()

    rememberDocumentChanges(queryClient, 1, { title: 'اول' }, 1)
    rememberDocumentChanges(queryClient, 1, { title: 'دوم' }, 2)
    rememberDocumentChanges(queryClient, 1, { title: 'قدیمی' }, 1)

    expect(rememberedDocumentChanges(queryClient, 1)?.changes).toEqual({
      title: 'دوم',
    })
    expect(rememberedDocumentChanges(otherQueryClient, 1)).toBeNull()
  })

  it('forgets only revisions at or below the saved revision', () => {
    const queryClient = createQueryClient()
    rememberDocumentChanges(queryClient, 1, { title: 'دوم' }, 2)

    forgetDocumentChanges(queryClient, 1, 1)
    expect(rememberedDocumentChanges(queryClient, 1)).not.toBeNull()

    forgetDocumentChanges(queryClient, 1, 2)
    expect(rememberedDocumentChanges(queryClient, 1)).toBeNull()
  })

  it('saves remembered changes and clears them on success', async () => {
    const save = vi.fn(async () => savedRecord)
    installBridge(save, async () => documentRecord)
    const queryClient = createQueryClient()
    queryClient.setQueryData(documentQuery(1).queryKey, documentRecord)
    rememberDocumentChanges(
      queryClient,
      1,
      { title: 'گزارش', body: '<p>تازه</p>' },
      2,
    )
    const onOpenDocument = vi.fn()

    await expect(
      retryRememberedDocumentChanges(queryClient, onOpenDocument),
    ).resolves.toBe(true)

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: '<p>تازه</p>',
    })
    expect(rememberedDocumentChanges(queryClient, 1)).toBeNull()
    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toEqual(
      savedRecord,
    )
    expect(onOpenDocument).not.toHaveBeenCalled()
  })

  it('keeps remembered changes and offers to reopen the document on failure', async () => {
    const save = vi.fn(async () => undefined)
    installBridge(save, async () => documentRecord)
    const queryClient = createQueryClient()
    rememberDocumentChanges(
      queryClient,
      1,
      { title: 'گزارش', body: '<p>تازه</p>' },
      2,
    )
    const errorToast = vi.spyOn(toast, 'error')
    const onOpenDocument = vi.fn()

    await expect(
      retryRememberedDocumentChanges(queryClient, onOpenDocument),
    ).resolves.toBe(false)

    expect(rememberedDocumentChanges(queryClient, 1)).not.toBeNull()
    expect(hasDocumentSaveFailed(queryClient, 1)).toBe(true)
    expect(errorToast).toHaveBeenCalledWith(
      'ذخیره ی تغییرات ناموفق بود. دوباره تلاش کنید.',
      expect.objectContaining({ description: expect.anything() }),
    )

    const options = errorToast.mock.calls[0]?.[1]
    expect(options?.action).toBeUndefined()
    const description = options?.description
    expect(isValidElement(description)).toBe(true)
    if (!isValidElement(description)) {
      throw new Error('the recovery toast is missing its open button')
    }

    const { getByRole } = render(description)
    const openDocument = getByRole('button', { name: 'باز کردن سند' })
    expect(openDocument).toHaveClass('w-full')
    fireEvent.click(openDocument)
    expect(onOpenDocument).toHaveBeenCalledWith(1)
  })

  it('shows the failure toast and returns before the existence check finishes', async () => {
    let finishGet!: (document: DocumentRecord | undefined) => void
    const save = vi.fn(async () => undefined)
    installBridge(
      save,
      () =>
        new Promise<DocumentRecord | undefined>((resolve) => {
          finishGet = resolve
        }),
    )
    const queryClient = createQueryClient()
    rememberDocumentChanges(
      queryClient,
      1,
      { title: 'گزارش', body: '<p>تازه</p>' },
      2,
    )
    const errorToast = vi.spyOn(toast, 'error')
    const dismissToast = vi.spyOn(toast, 'dismiss')

    await expect(retryRememberedDocumentChanges(queryClient)).resolves.toBe(
      false,
    )

    expect(errorToast).toHaveBeenCalledWith(
      'ذخیره ی تغییرات ناموفق بود. دوباره تلاش کنید.',
      { description: undefined },
    )
    expect(rememberedDocumentChanges(queryClient, 1)).not.toBeNull()

    finishGet(documentRecord)
    await Promise.resolve()
    await Promise.resolve()

    expect(rememberedDocumentChanges(queryClient, 1)).not.toBeNull()
    expect(dismissToast).not.toHaveBeenCalled()
  })

  it('shows and dismisses the failure toast when the document no longer exists', async () => {
    const save = vi.fn(async () => undefined)
    installBridge(save, async () => undefined)
    const queryClient = createQueryClient()
    rememberDocumentChanges(
      queryClient,
      1,
      { title: 'گزارش', body: '<p>تازه</p>' },
      2,
    )
    const errorToast = vi.spyOn(toast, 'error')
    const dismissToast = vi.spyOn(toast, 'dismiss')

    await expect(retryRememberedDocumentChanges(queryClient)).resolves.toBe(
      false,
    )

    await vi.waitFor(() =>
      expect(rememberedDocumentChanges(queryClient, 1)).toBeNull(),
    )
    expect(errorToast).toHaveBeenCalledWith(
      'ذخیره ی تغییرات ناموفق بود. دوباره تلاش کنید.',
      { description: undefined },
    )
    expect(dismissToast).toHaveBeenCalledWith(errorToast.mock.results[0]?.value)
  })

  it('keeps newer changes when an older existence check finds the document missing', async () => {
    let finishGet!: (document: DocumentRecord | undefined) => void
    const save = vi.fn(async () => undefined)
    installBridge(
      save,
      () =>
        new Promise<DocumentRecord | undefined>((resolve) => {
          finishGet = resolve
        }),
    )
    const queryClient = createQueryClient()
    rememberDocumentChanges(queryClient, 1, { title: 'قدیمی' }, 2)
    const dismissToast = vi.spyOn(toast, 'dismiss')

    await expect(retryRememberedDocumentChanges(queryClient)).resolves.toBe(
      false,
    )

    rememberDocumentChanges(queryClient, 1, { title: 'تازه' }, 3)
    finishGet(undefined)

    await vi.waitFor(() => expect(dismissToast).toHaveBeenCalledOnce())
    expect(rememberedDocumentChanges(queryClient, 1)).toMatchObject({
      changes: { title: 'تازه' },
      revision: 3,
    })
    expect(hasDocumentSaveFailed(queryClient, 1)).toBe(true)
  })
})
