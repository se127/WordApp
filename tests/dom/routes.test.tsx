import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { isDocumentSaving } from '@/lib/close-handshake'
import {
  clearHomeScrollPosition,
  saveHomeOrder,
  saveHomePage,
  saveHomeScrollPosition,
  saveHomeSearch,
} from '@/lib/home-page'
import { formatNumber } from '@/lib/number'
import {
  createQueryClient,
  documentPageSize,
  documentsCountQuery,
  documentsQuery,
  documentQuery,
} from '@/lib/query'
import { createAppRouter } from '@/router'
import type { DocumentChanges, DocumentListOptions } from '@/types/global'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

const dateSpies = vi.hoisted(() => ({
  formatAbsoluteDate: vi.fn(),
  formatRelativeTime: vi.fn(),
}))

vi.mock('@/lib/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/date')>()
  dateSpies.formatAbsoluteDate.mockImplementation(actual.formatAbsoluteDate)
  dateSpies.formatRelativeTime.mockImplementation(actual.formatRelativeTime)
  return {
    ...actual,
    formatAbsoluteDate: dateSpies.formatAbsoluteDate,
    formatRelativeTime: dateSpies.formatRelativeTime,
  }
})

type WordAppBridge = Window['WordApp']

const storedDocument = {
  id: 1,
  title: 'بدون عنوان',
  body: '',
  createdAt: 1_000,
  updatedAt: 1_000,
}

type TestDocument = Omit<typeof storedDocument, 'title'> & {
  title: string | null
}

function documentListPage(
  documents: Array<TestDocument>,
  { offset, limit, order = 'newest', search }: DocumentListOptions,
): Array<TestDocument> {
  const term = search?.trim().toLowerCase() ?? ''
  const matching =
    term === ''
      ? documents
      : documents.filter(
          (document) => document.title?.toLowerCase().includes(term) ?? false,
        )
  const ordered = order === 'oldest' ? [...matching].reverse() : matching
  return ordered.slice(offset, offset + limit)
}

function installBridge(
  options: {
    create?: () => Promise<TestDocument>
    get?: (id: number) => Promise<TestDocument | undefined>
    count?: (search: string | undefined, requestId: string) => Promise<number>
    list?: (
      options: DocumentListOptions,
      requestId: string,
    ) => Promise<Array<TestDocument>>
    cancel?: (requestId: string) => void
    save?: (
      id: number,
      changes: DocumentChanges,
    ) => Promise<TestDocument | undefined>
    remove?: (id: number) => Promise<void>
    removeMany?: (ids: number[]) => Promise<void>
  } = {},
) {
  let storedCount = 0
  let storedRow: TestDocument = storedDocument
  const create =
    options.create ??
    vi.fn(async () => {
      storedCount += 1
      return storedDocument
    })
  const get = options.get ?? vi.fn(async () => storedRow)
  const count = options.count ?? vi.fn(async () => storedCount)
  const list = options.list ?? vi.fn(async () => [])
  const cancel = options.cancel ?? vi.fn()
  const save =
    options.save ??
    vi.fn(async (_id: number, changes: DocumentChanges) => {
      storedRow = {
        ...storedRow,
        ...changes,
        updatedAt: storedRow.updatedAt + 1,
      }
      return storedRow
    })
  const remove = options.remove ?? vi.fn(async () => undefined)
  const removeMany = options.removeMany ?? vi.fn(async () => undefined)
  let beforeCloseListener: (() => void) | undefined
  const onBeforeClose = vi.fn((listener: () => void) => {
    beforeCloseListener = listener
    return () => {
      if (beforeCloseListener === listener) {
        beforeCloseListener = undefined
      }
    }
  })
  const closeReady = vi.fn()
  const closeCancelled = vi.fn()

  window.WordApp = {
    platform: 'win32',
    clipboard: {
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
    },
    lifecycle: {
      onBeforeClose,
      closeReady,
      closeCancelled,
    },
    documents: {
      create,
      get,
      count,
      list,
      cancel,
      save,
      delete: remove,
      deleteMany: removeMany,
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
  } satisfies WordAppBridge

  return {
    create,
    get,
    count,
    list,
    cancel,
    save,
    remove,
    removeMany,
    onBeforeClose,
    closeReady,
    closeCancelled,
    triggerBeforeClose: () => beforeCloseListener?.(),
  }
}

function installDocumentsBridge(
  documents: Array<TestDocument>,
  overrides: { removeMany?: (ids: number[]) => Promise<void> } = {},
) {
  const stored = [...documents]

  return installBridge({
    list: vi.fn(async (options: DocumentListOptions) =>
      documentListPage(stored, options),
    ),
    get: vi.fn(async (id: number) =>
      stored.find((document) => document.id === id),
    ),
    count: vi.fn(async (search?: string) => {
      const term = search?.trim().toLowerCase() ?? ''
      return term === ''
        ? stored.length
        : stored.filter(
            (document) => document.title?.toLowerCase().includes(term) ?? false,
          ).length
    }),
    remove: vi.fn(async (id: number) => {
      const index = stored.findIndex((document) => document.id === id)
      if (index >= 0) {
        stored.splice(index, 1)
      }
    }),
    removeMany:
      overrides.removeMany ??
      vi.fn(async (ids: number[]) => {
        for (const id of ids) {
          const index = stored.findIndex((document) => document.id === id)
          if (index >= 0) {
            stored.splice(index, 1)
          }
        }
      }),
  })
}

function renderRoute(initialEntry: string) {
  saveHomePage(1)
  saveHomeOrder('newest')
  saveHomeSearch('')
  clearHomeScrollPosition()
  const queryClient = createQueryClient()
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [initialEntry] }),
    queryClient,
  )

  render(
    <StrictMode>
      <DirectionProvider dir="rtl">
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </TooltipProvider>
      </DirectionProvider>
    </StrictMode>,
  )

  return { router, queryClient }
}

function pressSaveShortcut(): boolean {
  return fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })
}

function documentsPagination(): HTMLElement {
  return screen.getByRole('navigation', { name: 'صفحه بندی اسناد' })
}

function paginationPageLink(page: number): HTMLElement {
  return within(documentsPagination()).getByRole('link', {
    name: `صفحه ی ${formatNumber(page)}`,
  })
}

function listViewport(): HTMLElement {
  const viewport = document.querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]',
  )
  if (!viewport) {
    throw new Error('the list body is missing its scroll area viewport')
  }
  return viewport
}

function documentsTable(): HTMLElement {
  const table = document.querySelector<HTMLElement>(
    '[data-slot="documents-table"]',
  )
  if (!table) {
    throw new Error('the documents table is missing')
  }
  return table
}

function searchInput(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'جستجوی عنوان' })
}

afterEach(() => {
  saveHomePage(1)
  saveHomeOrder('newest')
  saveHomeSearch('')
  clearHomeScrollPosition()
  toast.dismiss()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('routes', () => {
  it('shows the documents heading with its count and the add-document button', async () => {
    const { count } = installBridge()

    renderRoute('/')

    const heading = await screen.findByRole('heading', {
      name: 'مستندات (۰)',
    })
    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('flex', 'items-center', 'gap-2')
    expect(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeInTheDocument()
    expect(count).toHaveBeenCalledOnce()
  })

  it('groups the document count with thousands separators', async () => {
    const count = vi.fn(async () => 3000)
    installBridge({ count })

    renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۳٬۰۰۰)' }),
    ).toBeInTheDocument()
  })

  it('renders the page right away and loads the count inline in the heading', async () => {
    let finishCount!: (count: number) => void
    const count = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          finishCount = resolve
        }),
    )
    installBridge({ count })

    renderRoute('/')

    const heading = await screen.findByRole('heading')
    const status = within(heading).getByRole('status')
    expect(status).toHaveTextContent('در حال بارگذاری تعداد سندها...')
    expect(status.querySelector('svg')).toHaveClass('size-4', 'animate-spin')
    expect(status.parentElement).toBe(heading)
    expect(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeInTheDocument()

    await act(() => finishCount(3))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۳)' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the stale count pulsing instead of the loader while an invalidated count re-reads', async () => {
    let reads = 0
    let finishRefetch!: (count: number) => void
    const count = vi.fn((): Promise<number> => {
      reads += 1
      if (reads > 1) {
        return new Promise<number>((resolve) => {
          finishRefetch = resolve
        })
      }
      return Promise.resolve(0)
    })
    installBridge({ count })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    await user.click(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    const staleCount = await screen.findByText('(۰)')
    expect(staleCount).toHaveClass('animate-pulse')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(() => finishRefetch(1))

    expect(await screen.findByText('(۱)')).not.toHaveClass('animate-pulse')
  })

  it('tabs from the theme picker to the add button on the home title row', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    await user.tab()

    expect(screen.getByRole('button', { name: 'تغییر پوسته' })).toHaveFocus()

    await user.tab()

    expect(screen.getByRole('button', { name: 'افزودن سند' })).toHaveFocus()
  })

  it('shows an outline count retry beside the destructive failure text on the heading line and recovers the count when pressed', async () => {
    let attempts = 0
    const count = vi.fn((): Promise<number> => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(new Error('count read failed'))
        : Promise.resolve(2)
    })
    installBridge({ count })
    const user = userEvent.setup()

    renderRoute('/')

    const message = await screen.findByText('بارگذاری تعداد سندها ناموفق بود.')
    expect(message).toHaveClass('text-destructive')
    const retry = screen.getByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(retry).toHaveAttribute('data-variant', 'outline')
    expect(retry).toHaveAttribute('data-size', 'default')
    expect(retry).not.toHaveClass('text-destructive')
    expect(retry.querySelector('svg')).not.toHaveClass('text-destructive')
    expect(retry).toHaveTextContent('تلاش دوباره')

    const heading = screen.getByRole('heading')
    expect(heading).toHaveClass('flex', 'items-center', 'gap-2')
    expect(heading).toContainElement(message)
    expect(heading).toContainElement(retry)
    expect(message.parentElement).toBe(retry.parentElement)
    expect(message.parentElement).toHaveClass('flex', 'items-center')
    expect(message.nextElementSibling).toBe(retry)

    retry.focus()
    await user.tab()

    expect(screen.getByRole('button', { name: 'تغییر پوسته' })).toHaveFocus()

    await user.click(retry)

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۲)' }),
    ).toBeInTheDocument()
    expect(count).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole('button', {
        name: 'تلاش دوباره',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows the heading loader while a retry from a failed count is in flight', async () => {
    let reads = 0
    let finishRetry!: (count: number) => void
    const count = vi.fn((): Promise<number> => {
      reads += 1
      if (reads === 1) {
        return Promise.reject(new Error('count read failed'))
      }
      return new Promise<number>((resolve) => {
        finishRetry = resolve
      })
    })
    installBridge({ count })
    const user = userEvent.setup()

    renderRoute('/')

    await user.click(
      await screen.findByRole('button', {
        name: 'تلاش دوباره',
      }),
    )

    const heading = screen.getByRole('heading')
    expect(await within(heading).findByRole('status')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'تلاش دوباره',
      }),
    ).not.toBeInTheDocument()

    await vi.waitFor(() => expect(finishRetry).toBeTypeOf('function'))
    await act(() => finishRetry(5))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۵)' }),
    ).toBeInTheDocument()
  })

  it('keeps the retry button busy while a stale count is read again', async () => {
    let reads = 0
    let finishRetry!: (count: number) => void
    const count = vi.fn((): Promise<number> => {
      reads += 1
      if (reads === 1) {
        return Promise.resolve(3)
      }
      if (reads === 2) {
        return Promise.reject(new Error('count re-read failed'))
      }
      return new Promise<number>((resolve) => {
        finishRetry = resolve
      })
    })
    installBridge({ count })
    const user = userEvent.setup()

    const { queryClient } = renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۳)' })

    await act(async () => {
      await queryClient
        .invalidateQueries({ queryKey: documentsCountQuery.queryKey })
        .catch(() => {})
    })

    const retry = await screen.findByRole('button', {
      name: 'تلاش دوباره',
    })

    await user.click(retry)
    const busy = screen.getByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(busy).toBeDisabled()
    expect(busy.querySelector('svg')).toHaveClass('size-4', 'animate-spin')

    await vi.waitFor(() => expect(finishRetry).toBeTypeOf('function'))
    await act(() => finishRetry(4))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۴)' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'تلاش دوباره',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows the pending spinner while the document row is loading, then the title with its options menu', async () => {
    let finishGet!: (document: TestDocument) => void
    const get = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishGet = resolve
        }),
    )
    installBridge({ get })

    renderRoute('/documents/1')

    await screen.findByRole('button', { name: 'تغییر پوسته' })
    const status = await screen.findByRole('status', {
      name: 'در حال بارگذاری سند',
    })
    expect(status).toHaveTextContent('در حال بارگذاری سند...')
    expect(
      screen.queryByRole('button', { name: 'گزینه ها' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()

    await act(() => finishGet(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'گزینه ها' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the body editor under the title inside a scrollable prose area with the formatting toolbar', async () => {
    const body = '<p>متن <strong>مهم</strong></p>'
    const get = vi.fn(async () => ({ ...storedDocument, body }))
    installBridge({ get })

    renderRoute('/documents/1')

    const heading = await screen.findByRole('heading', { name: 'بدون عنوان' })
    const editor = await screen.findByRole('textbox', { name: 'متن سند' })
    expect(
      heading.compareDocumentPosition(editor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)
    expect(editor).toHaveTextContent('متن مهم')
    expect(editor.querySelector('strong')).toHaveTextContent('مهم')
    expect(editor.closest('.document-body-prose')).toHaveClass('prose')
    expect(editor.closest('[data-slot="scroll-area"]')).not.toBeNull()
    expect(editor.closest('[data-slot="scroll-area-viewport"]')).not.toBeNull()

    const toolbar = screen.getByRole('toolbar', {
      name: 'ابزارهای ویرایش متن',
    })
    expect(toolbar).toHaveAttribute('dir', 'rtl')
    expect(toolbar).toHaveClass(
      '-mx-6',
      'flex',
      'flex-wrap',
      'gap-x-1',
      'gap-y-2',
      'border-y',
      'bg-gray-100',
      'px-6',
      'dark:bg-zinc-800',
    )
    expect(toolbar).not.toHaveClass('w-full')
    expect(toolbar).not.toHaveClass('border-x')
    expect(toolbar).not.toHaveClass('px-4')
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'برگرداندن',
      'بازگرداندن',
      'جهت متن',
      'توپر',
      'کج',
      'زیرخط دار',
      'خط خورده',
      'رنگ متن',
      'رنگ پس زمینه',
      'لیست نقطه ای',
      'لیست نشانه دار',
      'تراز متن',
      'موقعیت متن',
      'کد',
      'نقل قول',
      'خط افقی',
      'افزودن جدول',
      'افزودن / ویرایش لینک',
      'افزودن تصویر',
      'ایموجی',
    ])

    const page = document.querySelector('.document-body-editor')?.parentElement
    expect(page).toHaveClass('flex', 'min-h-0', 'flex-1', 'flex-col', 'pt-6')
    expect(page).not.toHaveClass('overflow-auto')
    expect(page).not.toHaveClass('p-6')
    expect(page).not.toHaveClass('px-6')
    expect(page).not.toHaveClass('py-6')
    expect(document.querySelector('.document-body-editor')).not.toHaveClass(
      'mt-2',
    )

    const back = screen.getByRole('link', { name: 'بازگشت به مستندات' })
    const titleBar = document.querySelector('[data-slot="title-bar"]')
    expect(back.closest('[data-slot="title-bar"]')).toBe(titleBar)
    expect(titleBar?.parentElement).toHaveClass(
      'flex',
      'h-full',
      'min-h-0',
      'flex-col',
    )
    expect(titleBar?.parentElement).not.toHaveClass('p-6')
    expect(back.parentElement).not.toHaveClass('pe-4')
    expect(titleBar).toHaveClass('justify-between', 'relative')
    expect(titleBar).not.toHaveClass('absolute', 'pointer-events-none')
    expect(titleBar?.firstElementChild).toContainElement(back)
    expect(titleBar?.lastElementChild).toContainElement(
      screen.getByRole('button', { name: 'تغییر پوسته' }),
    )
    expect(heading.parentElement).toHaveClass('mb-5')
    expect(heading.parentElement).not.toHaveClass('px-4')
    expect(heading.parentElement).not.toHaveClass('px-6')
  })

  it('reports a failed document read with an error and a retry button, and recovers the document when pressed', async () => {
    let attempts = 0
    const get = vi.fn((): Promise<TestDocument> => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(
            new Error(
              'The getDocument operation failed (injected by --with-db-failure)',
            ),
          )
        : Promise.resolve(storedDocument)
    })
    installBridge({ get })
    const user = userEvent.setup()

    renderRoute('/documents/1')

    const message = await screen.findByText('بارگذاری سند ناموفق بود.')
    expect(message.parentElement).toHaveClass(
      'items-center',
      'justify-center',
      'flex-col',
    )
    expect(
      screen.queryByText(
        'The getDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    const retry = screen.getByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(retry).toHaveAttribute('data-variant', 'outline')
    expect(retry).toHaveAttribute('data-size', 'default')
    expect(retry.querySelector('svg')).not.toHaveClass('text-destructive')

    await user.click(retry)

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سند ناموفق بود.'),
    ).not.toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('shows the content-box spinner while a retry from a failed document read is in flight', async () => {
    let reads = 0
    let finishRetry!: (document: TestDocument) => void
    const get = vi.fn((): Promise<TestDocument> => {
      reads += 1
      if (reads === 1) {
        return Promise.reject(new Error('document read failed'))
      }
      return new Promise<TestDocument>((resolve) => {
        finishRetry = resolve
      })
    })
    installBridge({ get })
    const user = userEvent.setup()

    renderRoute('/documents/1')

    await user.click(
      await screen.findByRole('button', {
        name: 'تلاش دوباره',
      }),
    )

    expect(
      await screen.findByRole('status', { name: 'در حال بارگذاری سند' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سند ناموفق بود.'),
    ).not.toBeInTheDocument()

    await vi.waitFor(() => expect(finishRetry).toBeTypeOf('function'))
    await act(() => finishRetry(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the document retry as a labeled button without a tooltip', async () => {
    const get = vi.fn(async (): Promise<TestDocument> => {
      throw new Error('document read failed')
    })
    installBridge({ get })
    const user = userEvent.setup()

    renderRoute('/documents/1')

    const retry = await screen.findByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(retry.querySelector('svg')).toHaveClass('lucide-refresh-cw')
    expect(retry).toHaveTextContent('تلاش دوباره')

    await user.hover(retry)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('explains that a document id has no stored row instead of leaving the page blank', async () => {
    installBridge({ get: vi.fn(async () => undefined) })

    renderRoute('/documents/999')

    expect(
      await screen.findByText('سندی با این شناسه پیدا نشد.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'بازگشت به مستندات' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a Persian not-found page with a way home for an unknown route', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/missing-page')

    expect(
      await screen.findByText('صفحه ی مورد نظر پیدا نشد.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Not Found')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
  })

  it('shows a Persian error page with a retry when a route fails to render', async () => {
    installDocumentsBridge([storedDocument])
    const renderRelativeTime =
      dateSpies.formatRelativeTime.getMockImplementation()
    if (renderRelativeTime === undefined) {
      throw new Error('The relative time formatter is not mocked')
    }
    let shouldFail = true
    dateSpies.formatRelativeTime.mockImplementation((timestamp: number) => {
      if (shouldFail) {
        throw new Error('The row could not be rendered')
      }
      return renderRelativeTime(timestamp)
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()

    renderRoute('/')

    expect(
      await screen.findByText('نمایش این صفحه ناموفق بود.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong!')).not.toBeInTheDocument()

    shouldFail = false
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))

    expect(
      await screen.findByRole('link', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    dateSpies.formatRelativeTime.mockImplementation(renderRelativeTime)
    consoleError.mockRestore()
  })

  it('shows the stored title as a full-width heading at the icon-button height that truncates, tints on hover and focus, and borders on focus', async () => {
    installBridge()

    renderRoute('/documents/1')

    const heading = await screen.findByRole('heading', { name: 'بدون عنوان' })
    expect(heading).toHaveClass('h-8', 'min-w-0', 'flex-1', 'truncate')
    expect(heading).toHaveClass(
      'cursor-default',
      'transition-colors',
      'hover:bg-gray-100',
      'focus:bg-gray-100',
      'dark:hover:bg-zinc-800',
      'dark:focus:bg-zinc-800',
      'focus:border-input',
    )
  })

  it('turns the title into a bordered input with everything selected when clicked', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))

    const input = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    expect(input).toHaveClass('h-8', 'border', 'bg-transparent')
    expect(input).toHaveValue('بدون عنوان')
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('بدون عنوان'.length)
  })

  it('keeps the heading on a Tab — border showing — and opens the input on Space', async () => {
    const { save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    const heading = await screen.findByRole('heading', { name: 'بدون عنوان' })
    const back = screen.getByRole('link', { name: 'بازگشت به مستندات' })
    const picker = screen.getByRole('button', { name: 'تغییر پوسته' })

    back.focus()
    await user.tab()

    expect(picker).toHaveFocus()

    await user.tab()

    expect(heading).toHaveFocus()
    expect(heading).toHaveClass('focus:border-input')
    expect(
      screen.queryByRole('textbox', { name: 'عنوان سند' }),
    ).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()

    await user.keyboard(' ')

    const input = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    expect(input).toHaveValue('بدون عنوان')
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('بدون عنوان'.length)

    await user.tab()
    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'عنوان سند' }),
    ).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('opens the title input on Enter while the heading has focus', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    const heading = await screen.findByRole('heading', { name: 'بدون عنوان' })
    heading.focus()

    await user.keyboard('{Enter}')

    const input = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(input).toHaveValue('بدون عنوان')
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('بدون عنوان'.length)
  })

  it('hands focus back to the heading when Enter closes the title editor', async () => {
    const { save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    const heading = await screen.findByRole('heading', { name: 'بدون عنوان' })
    heading.focus()

    await user.keyboard('{Enter}')
    const input = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    await user.keyboard('گزارش')
    expect(input).toHaveValue('گزارش')
    expect(save).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')

    const saved = await screen.findByRole(
      'heading',
      { name: 'گزارش' },
      { timeout: 1_500 },
    )
    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: 'گزارش',
          body: '',
        })
      },
      { timeout: 1_500 },
    )
    await vi.waitFor(() => expect(saved).toHaveFocus())

    await user.keyboard('{Enter}')
    await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    await user.keyboard('{Enter}')

    const keptHeading = await screen.findByRole('heading', { name: 'گزارش' })
    await vi.waitFor(() => expect(keptHeading).toHaveFocus())
    expect(save).toHaveBeenCalledTimes(1)

    await user.tab()
    expect(screen.getByRole('button', { name: 'گزینه ها' })).toHaveFocus()
  })

  it('debounces title saves while the input stays focused without a loading state', async () => {
    const { get, save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })

    await user.clear(input)
    await user.type(input, 'گزارش سالانه')

    expect(save).not.toHaveBeenCalled()
    expect(input).not.toBeDisabled()
    expect(input).toHaveFocus()

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: 'گزارش سالانه',
          body: '',
        })
      },
      { timeout: 1_500 },
    )

    expect(input).not.toBeDisabled()
    expect(input).toHaveFocus()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await user.tab()

    expect(
      await screen.findByRole('heading', { name: 'گزارش سالانه' }),
    ).toBeInTheDocument()
    expect(save).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledOnce()
  })

  it('does not save when the title is blurred unchanged', async () => {
    const { save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    await screen.findByRole('textbox', { name: 'عنوان سند' })

    await user.tab()

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
    expect(
      screen.queryByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()
  })

  it('keeps the typed title on Escape and saves it without canceling the edit', async () => {
    const { save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'پیش نویس')

    await user.keyboard('{Escape}')

    const kept = await screen.findByRole('heading', { name: 'پیش نویس' })
    expect(
      screen.queryByRole('textbox', { name: 'عنوان سند' }),
    ).not.toBeInTheDocument()
    await vi.waitFor(() => expect(kept).toHaveFocus())
    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: 'پیش نویس',
          body: '',
        })
      },
      { timeout: 1_500 },
    )
  })

  it('saves a non-empty title exactly as typed', async () => {
    const { save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, '  گزارش سالانه  ')
    expect(input).toHaveValue('  گزارش سالانه  ')

    await user.tab()

    expect(
      await screen.findByRole('heading', { name: 'گزارش سالانه' }),
    ).toBeInTheDocument()
    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: '  گزارش سالانه  ',
          body: '',
        })
      },
      { timeout: 1_500 },
    )
  })

  it('shows the untitled placeholder and saves null when the draft is only whitespace', async () => {
    const { save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, '   ')
    expect(input).toHaveValue('   ')

    await user.tab()

    expect(
      await screen.findByRole('heading', {
        name: 'عنوانی انتخاب نشده است.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'عنوان سند' }),
    ).not.toBeInTheDocument()
    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: null,
          body: '',
        })
      },
      { timeout: 1_500 },
    )
  })

  it.each(['{Enter}', '{Escape}', '{Tab}'])(
    'shows the untitled placeholder when %s closes an empty title',
    async (key) => {
      const { save } = installBridge()
      const user = userEvent.setup()

      renderRoute('/documents/1')
      await user.click(
        await screen.findByRole('heading', { name: 'بدون عنوان' }),
      )
      const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
      await user.clear(input)
      expect(input).toHaveValue('')

      await user.keyboard(key)

      expect(
        await screen.findByRole('heading', {
          name: 'عنوانی انتخاب نشده است.',
        }),
      ).toBeInTheDocument()
      await vi.waitFor(
        () => {
          expect(save).toHaveBeenCalledExactlyOnceWith(1, {
            title: null,
            body: '',
          })
        },
        { timeout: 1_500 },
      )
    },
  )

  it('shows the untitled placeholder for a saved document without a title and opens an empty input', async () => {
    const untitled = { ...storedDocument, title: null }
    installBridge({ get: vi.fn(async () => untitled) })
    const user = userEvent.setup()

    renderRoute('/documents/1')

    const heading = await screen.findByRole('heading', {
      name: 'عنوانی انتخاب نشده است.',
    })
    await user.click(heading)

    const input = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('saves the title in the background without disabling the input', async () => {
    let storedRow = storedDocument
    const get = vi.fn(async () => storedRow)
    let finishSave!: (document: TestDocument) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishSave = resolve
        }),
    )
    installBridge({ get, save })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'پیگیری')

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: 'پیگیری',
          body: '',
        })
      },
      { timeout: 1_500 },
    )

    const pending = screen.getByRole('textbox', { name: 'عنوان سند' })
    expect(pending).not.toBeDisabled()
    expect(pending).toHaveValue('پیگیری')
    expect(pending).toHaveFocus()
    expect(pending).not.toHaveClass('pe-8')
    expect(pending.parentElement?.querySelector('.animate-spin')).toBeNull()
    const saving = screen.getByRole('status', { name: 'در حال ذخیره...' })
    expect(saving).toHaveTextContent('در حال ذخیره...')
    expect(saving.closest('[data-slot="title-bar"]')).not.toBeNull()
    expect(saving.parentElement).toHaveClass(
      'absolute',
      'left-1/2',
      '-translate-x-1/2',
    )
    expect(saving.querySelector('svg')).toHaveClass('size-4', 'animate-spin')

    storedRow = {
      ...storedRow,
      title: 'پیگیری',
      updatedAt: storedRow.updatedAt + 1,
    }
    await act(() => finishSave(storedRow))

    await vi.waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'در حال ذخیره...' }),
      ).not.toBeInTheDocument()
    })
    expect(pending).toHaveValue('پیگیری')
    expect(pending).not.toBeDisabled()
    await user.tab()
    expect(
      await screen.findByRole('heading', { name: 'پیگیری' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'عنوان سند' }),
    ).not.toBeInTheDocument()
  })

  it('saves pending changes when Ctrl+S is pressed', async () => {
    const { save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    expect(save).not.toHaveBeenCalled()
    expect(pressSaveShortcut()).toBe(false)

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: 'گزارش',
          body: '',
        })
      },
      { timeout: 1_500 },
    )
  })

  it('does not save again when Ctrl+S is pressed during a debounced save', async () => {
    let finishSave!: (document: TestDocument) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishSave = resolve
        }),
    )
    installBridge({ save })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce(), {
      timeout: 1_500,
    })
    expect(
      screen.getByRole('status', { name: 'در حال ذخیره...' }),
    ).toBeInTheDocument()

    expect(pressSaveShortcut()).toBe(false)
    expect(pressSaveShortcut()).toBe(false)
    expect(save).toHaveBeenCalledOnce()

    await act(() =>
      finishSave({ ...storedDocument, title: 'گزارش', updatedAt: 2_000 }),
    )

    expect(save).toHaveBeenCalledOnce()
  })

  it('does not intercept Ctrl+S on the documents page', async () => {
    const { save } = installBridge()

    renderRoute('/')
    await screen.findByRole('heading', { name: /مستندات/ })

    expect(pressSaveShortcut()).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('reports a failed save with an error toast and keeps the edited text for another try', async () => {
    let attempts = 0
    let storedRow: TestDocument = storedDocument
    const get = vi.fn(async () => storedRow)
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => {
      attempts += 1
      if (attempts === 1) {
        throw new Error(
          'The saveDocument operation failed (injected by --with-db-failure)',
        )
      }

      storedRow = {
        ...storedRow,
        ...changes,
        updatedAt: storedRow.updatedAt + 1,
      }
      return storedRow
    })
    installBridge({ get, save })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'پیش نویس')
    await user.tab()

    expect(
      await screen.findByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The saveDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'عنوان سند' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'پیش نویس' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('heading', { name: 'پیش نویس' }))
    const kept = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    expect(kept).toHaveValue('پیش نویس')
    expect(kept).not.toBeDisabled()
    expect(kept).toHaveFocus()

    await user.clear(kept)
    await user.type(kept, 'پیش نویس دوم')
    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledTimes(2)
      },
      { timeout: 1_500 },
    )

    await user.tab()

    expect(
      await screen.findByRole('heading', { name: 'پیش نویس دوم' }),
    ).toBeInTheDocument()
    expect(save).toHaveBeenLastCalledWith(1, {
      title: 'پیش نویس دوم',
      body: '',
    })
  })

  it('keeps the body text and shows only an error toast when a body save fails', async () => {
    let rejectSave!: (error: Error) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    installBridge({ save })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    const editor = await screen.findByRole('textbox', { name: 'متن سند' })
    await user.click(editor)
    await user.keyboard('متن')

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: 'بدون عنوان',
          body: expect.stringContaining('متن'),
        })
      },
      { timeout: 1_500 },
    )
    expect(
      screen.getByRole('status', { name: 'در حال ذخیره...' }),
    ).toHaveTextContent('در حال ذخیره...')
    expect(editor).toHaveTextContent('متن')

    await act(() =>
      rejectSave(
        new Error(
          'The saveDocument operation failed (injected by --with-db-failure)',
        ),
      ),
    )

    expect(
      await screen.findByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(editor).toHaveTextContent('متن')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('saves a pending title before signaling that the window can close', async () => {
    const { save, triggerBeforeClose, closeReady } = installDocumentsBridge([
      storedDocument,
    ])
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش سالانه')

    await act(async () => {
      triggerBeforeClose()
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(closeReady).toHaveBeenCalledOnce())
    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش سالانه',
      body: '',
    })

    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('heading', { name: 'گزارش سالانه' }),
    ).toBeInTheDocument()
  })

  it('keeps the window open when a pending save fails before close', async () => {
    let rejectSave!: (error: Error) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    const { triggerBeforeClose, closeReady, closeCancelled } = installBridge({
      save,
    })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledExactlyOnceWith(1, {
          title: 'گزارش',
          body: '',
        })
      },
      { timeout: 1_500 },
    )

    await act(async () => {
      triggerBeforeClose()
      await Promise.resolve()
    })

    expect(closeReady).not.toHaveBeenCalled()
    expect(closeCancelled).not.toHaveBeenCalled()

    await act(() =>
      rejectSave(
        new Error(
          'The saveDocument operation failed (injected by --with-db-failure)',
        ),
      ),
    )

    expect(
      await screen.findByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(closeCancelled).toHaveBeenCalledOnce())
    expect(closeReady).not.toHaveBeenCalled()
  })

  it('signals close immediately when no title edit is pending', async () => {
    const { save, triggerBeforeClose, closeReady } = installDocumentsBridge([
      storedDocument,
    ])

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await act(async () => {
      triggerBeforeClose()
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(closeReady).toHaveBeenCalledOnce())
    expect(save).not.toHaveBeenCalled()
  })

  it('waits for an in-flight title save before signaling close', async () => {
    let finishSave!: (document: TestDocument) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishSave = resolve
        }),
    )
    const { triggerBeforeClose, closeReady } = installBridge({ save })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'پیگیری')

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledOnce()
      },
      { timeout: 1_500 },
    )
    expect(
      screen.getByRole('status', { name: 'در حال ذخیره...' }),
    ).toHaveTextContent('در حال ذخیره...')

    await act(async () => {
      triggerBeforeClose()
      await Promise.resolve()
    })

    expect(closeReady).not.toHaveBeenCalled()

    const saved = {
      ...storedDocument,
      title: 'پیگیری',
      updatedAt: 2_000,
    }
    await act(() => finishSave(saved))

    await vi.waitFor(() => expect(closeReady).toHaveBeenCalledOnce())
    expect(save).toHaveBeenCalledOnce()
  })

  it('keeps the documents back link usable while a save is in flight and leaves immediately', async () => {
    let finishSave!: (document: TestDocument) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishSave = resolve
        }),
    )
    installBridge({
      save,
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [storedDocument]),
    })
    const user = userEvent.setup()

    const { queryClient } = renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledOnce()
      },
      { timeout: 1_500 },
    )

    const back = screen.getByRole('link', { name: 'بازگشت به مستندات' })
    expect(
      screen.queryByRole('button', { name: 'بازگشت به مستندات' }),
    ).not.toBeInTheDocument()

    await user.click(back)

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    expect(
      queryClient.getQueryData<TestDocument>(documentQuery(1).queryKey)?.title,
    ).toBe('گزارش')

    await act(() =>
      finishSave({
        ...storedDocument,
        title: 'گزارش',
        updatedAt: 2_000,
      }),
    )

    expect(save).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
  })

  it('leaves immediately and saves a pending debounce after the page unmounts', async () => {
    let finishSave!: (document: TestDocument) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishSave = resolve
        }),
    )
    installBridge({
      save,
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [storedDocument]),
    })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    expect(save).not.toHaveBeenCalled()

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()

    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledExactlyOnceWith(1, {
        title: 'گزارش',
        body: '',
      })
    })

    await act(() =>
      finishSave({
        ...storedDocument,
        title: 'گزارش',
        updatedAt: 2_000,
      }),
    )

    expect(save).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
  })

  it('saves once and shows one error toast when the back link save fails', async () => {
    const save = vi.fn(async () => {
      throw new Error(
        'The saveDocument operation failed (injected by --with-db-failure)',
      )
    })
    installBridge({
      save,
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [storedDocument]),
    })
    const user = userEvent.setup()

    const { queryClient } = renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: '',
    })
    expect(
      screen.getAllByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toHaveLength(1)
    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toBeUndefined()
  })

  it('keeps the saved title when the back link follows a failed save', async () => {
    const documents = [{ ...storedDocument, title: 'ذخیره شده' }]
    const save = vi.fn(async () => {
      throw new Error(
        'The saveDocument operation failed (injected by --with-db-failure)',
      )
    })
    const get = vi.fn(async (id: number) =>
      documents.find((document) => document.id === id),
    )
    installBridge({
      save,
      count: vi.fn(async () => documents.length),
      list: vi.fn(async (options: DocumentListOptions) =>
        documentListPage(documents, options),
      ),
      get,
    })
    const user = userEvent.setup()

    const { queryClient } = renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'ذخیره شده' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    const getCallsBeforeFailure = get.mock.calls.length
    expect(
      await screen.findByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(get.mock.calls.length).toBeGreaterThan(getCallsBeforeFailure)
    })
    expect(
      queryClient.getQueryData<TestDocument>(documentQuery(1).queryKey)?.title,
    ).toBe('ذخیره شده')

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'ذخیره شده' }),
    ).toBeInTheDocument()
    expect(
      queryClient.getQueryData<TestDocument>(documentQuery(1).queryKey)?.title,
    ).toBe('ذخیره شده')
  })

  it('retries a remembered change when the window closes after the back link', async () => {
    let stored: TestDocument = { ...storedDocument }
    let attempts = 0
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => {
      attempts += 1
      if (attempts === 1) {
        return undefined
      }
      stored = { ...stored, ...changes, updatedAt: 2_000 }
      return stored
    })
    const { triggerBeforeClose, closeReady, closeCancelled } = installBridge({
      save,
      get: vi.fn(async () => stored),
      count: vi.fn(async () => 1),
      list: vi.fn(async (options: DocumentListOptions) =>
        documentListPage([stored], options),
      ),
    })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')
    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce(), {
      timeout: 1_500,
    })
    expect(
      await screen.findByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()

    await act(async () => {
      triggerBeforeClose()
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(closeReady).toHaveBeenCalledOnce())
    expect(closeCancelled).not.toHaveBeenCalled()
    expect(save).toHaveBeenLastCalledWith(1, {
      title: 'گزارش',
      body: '',
    })
  })

  it('keeps the window open and restores the unsaved changes when the close retry fails', async () => {
    const stored: TestDocument = { ...storedDocument }
    const save = vi.fn(async () => undefined)
    let finishExists!: (document: TestDocument | undefined) => void
    let holdExists = false
    const get = vi.fn(() =>
      holdExists
        ? new Promise<TestDocument | undefined>((resolve) => {
            finishExists = resolve
          })
        : Promise.resolve(stored),
    )
    const { triggerBeforeClose, closeReady, closeCancelled } = installBridge({
      save,
      get,
      count: vi.fn(async () => 1),
      list: vi.fn(async (options: DocumentListOptions) =>
        documentListPage([stored], options),
      ),
    })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')
    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce(), {
      timeout: 1_500,
    })

    holdExists = true
    await act(async () => {
      triggerBeforeClose()
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByText('ذخیره ی تغییرات ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    await vi.waitFor(() => expect(closeCancelled).toHaveBeenCalledOnce())
    expect(closeReady).not.toHaveBeenCalled()

    await act(async () => {
      holdExists = false
      finishExists(stored)
      await Promise.resolve()
    })
    expect(
      screen.getByText('ذخیره ی تغییرات ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()

    const openDocument = screen.getByRole('button', {
      name: 'باز کردن سند',
    })
    expect(openDocument).toHaveClass('w-full')
    await user.click(openDocument)

    expect(
      await screen.findByRole('heading', { name: 'گزارش' }),
    ).toBeInTheDocument()
  })

  it('shows a newly created document while its save is pending after a cancelled list read', async () => {
    const documents: Array<TestDocument> = []
    let finishCreate!: (document: TestDocument) => void
    let finishSave!: (document: TestDocument | undefined) => void
    let holdList = false
    let listWasHeld = false
    const create = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishCreate = resolve
        }),
    )
    const list = vi.fn((options: DocumentListOptions) => {
      if (holdList) {
        holdList = false
        listWasHeld = true
        return new Promise<Array<TestDocument>>(() => {})
      }
      return Promise.resolve(documentListPage(documents, options))
    })
    const save = vi.fn(
      () =>
        new Promise<TestDocument | undefined>((resolve) => {
          finishSave = resolve
        }),
    )
    installBridge({
      create,
      save,
      count: vi.fn(async () => documents.length),
      list,
      get: vi.fn(async (id: number) =>
        documents.find((document) => document.id === id),
      ),
    })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByText('هنوز سندی ثبت نشده است.')
    await user.click(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    )

    const created = {
      ...storedDocument,
      id: 1,
      title: null,
      createdAt: 2_000,
      updatedAt: 2_000,
    } satisfies TestDocument

    await act(() => {
      documents.push(created)
      holdList = true
      finishCreate(created)
    })
    await screen.findByRole('heading', { name: 'عنوانی انتخاب نشده است.' })
    await vi.waitFor(() => expect(listWasHeld).toBe(true))

    await user.click(
      screen.getByRole('heading', { name: 'عنوانی انتخاب نشده است.' }),
    )
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledExactlyOnceWith(1, {
        title: 'گزارش',
        body: '',
      })
    })
    expect(
      await screen.findByRole('link', { name: 'عنوانی انتخاب نشده است.' }),
    ).toBeInTheDocument()

    await act(async () => {
      finishSave(undefined)
    })

    expect(
      await screen.findByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'عنوانی انتخاب نشده است.' }),
    ).toBeInTheDocument()
  })

  it('leaves immediately and saves a pending title in the background', async () => {
    let finishSave!: (document: TestDocument) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishSave = resolve
        }),
    )
    const { closeReady } = installBridge({
      save,
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [storedDocument]),
    })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'پیگیری')

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()

    await vi.waitFor(() => {
      expect(save).toHaveBeenCalledExactlyOnceWith(1, {
        title: 'پیگیری',
        body: '',
      })
    })

    const saving = screen.getByRole('status', { name: 'در حال ذخیره...' })
    expect(saving.closest('[data-slot="title-bar"]')).not.toBeNull()
    expect(saving).toHaveTextContent('در حال ذخیره...')

    await act(() =>
      finishSave({
        ...storedDocument,
        title: 'پیگیری',
        updatedAt: 2_000,
      }),
    )

    await vi.waitFor(() => {
      expect(
        screen.queryByRole('status', { name: 'در حال ذخیره...' }),
      ).not.toBeInTheDocument()
    })
    expect(closeReady).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledOnce()
  })

  it('saves pending title and body changes after leaving through the documents back link', async () => {
    const pendingSaves: Array<{
      changes: DocumentChanges
      resolve: (document: TestDocument) => void
    }> = []
    const save = vi.fn(
      (_id: number, changes: DocumentChanges) =>
        new Promise<TestDocument>((resolve) => {
          pendingSaves.push({ changes, resolve })
        }),
    )
    installBridge({
      save,
      count: vi.fn(async () => 1),
      list: vi.fn(async () => [storedDocument]),
    })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const titleInput = await screen.findByRole('textbox', {
      name: 'عنوان سند',
    })
    await user.clear(titleInput)
    await user.type(titleInput, 'گزارش')

    const editor = await screen.findByRole('textbox', { name: 'متن سند' })
    await user.click(editor)
    await user.keyboard('متن')

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()

    await vi.waitFor(() => {
      expect(pendingSaves).toHaveLength(1)
    })
    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش',
      body: expect.stringContaining('متن'),
    })

    const [pending] = pendingSaves
    await act(() =>
      pending.resolve({
        ...storedDocument,
        ...pending.changes,
        updatedAt: 2_000,
      }),
    )

    expect(save).toHaveBeenCalledOnce()
  })

  it('creates an untitled document and opens its empty page with the placeholder', async () => {
    const untitled = { ...storedDocument, title: null }
    const { create, get } = installBridge({
      create: vi.fn(async () => untitled),
      get: vi.fn(async () => untitled),
    })
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(
      await screen.findByRole('button', {
        name: 'افزودن سند',
      }),
    )

    expect(create).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('heading', {
        name: 'عنوانی انتخاب نشده است.',
      }),
    ).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(1)
  })

  it('disables the create button and shows a spinner while the document is being created', async () => {
    let finishCreate!: (document: TestDocument) => void
    const create = vi.fn(
      () =>
        new Promise<TestDocument>((resolve) => {
          finishCreate = resolve
        }),
    )
    installBridge({ create })
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(
      await screen.findByRole('button', {
        name: 'افزودن سند',
      }),
    )

    const button = screen.getByRole('button', {
      name: 'در حال ساخت سند...',
    })
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('size-4', 'animate-spin')

    await act(() => finishCreate(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
  })

  it('returns to the home page through the document back link', async () => {
    installDocumentsBridge([storedDocument])
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    const back = screen.getByRole('link', { name: 'بازگشت به مستندات' })
    expect(back).toHaveAttribute('data-variant', 'outline')
    expect(back.querySelector('svg')).toHaveClass('lucide-arrow-right')
    expect(back).toHaveTextContent('بازگشت به مستندات')
    expect(back).toHaveAttribute('dir', 'rtl')
    expect(back.closest('[data-slot="title-bar"]')).not.toBeNull()

    await user.click(back)

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
  })

  it('does not leave the document page in history when the back link is used', async () => {
    installDocumentsBridge([storedDocument])
    const user = userEvent.setup()

    const { router } = renderRoute('/')
    await user.click(await screen.findByRole('link', { name: 'بدون عنوان' }))
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    await screen.findByRole('heading', { name: 'مستندات (۱)' })

    await act(() => router.history.back())

    expect(router.state.location.pathname).toBe('/')
    expect(
      screen.getByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'بدون عنوان' }),
    ).not.toBeInTheDocument()
  })

  it('offers delete in the options menu and asks for confirmation before deleting', async () => {
    const { remove } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    const deleteItem = await screen.findByRole('menuitem', { name: 'حذف' })
    expect(deleteItem.querySelector('svg')).toHaveClass('lucide-trash')
    expect(deleteItem).toHaveAttribute('data-variant', 'destructive')
    await user.click(deleteItem)

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        'آیا مطمئن هستید که می خواهید سند «بدون عنوان» را حذف کنید؟',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('این عملیات غیر قابل بازگشت است.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'بله' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'انصراف' }),
    ).toBeInTheDocument()

    await vi.waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { hidden: true, name: 'حذف' }),
      ).not.toBeInTheDocument(),
    )
    expect(remove).not.toHaveBeenCalled()
  })

  it('closes the options menu when the delete item is picked', async () => {
    const { remove } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))

    const dialog = await screen.findByRole('alertdialog')
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { hidden: true, name: 'حذف' }),
      ).not.toBeInTheDocument(),
    )

    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }))
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('menuitem', { hidden: true, name: 'حذف' }),
    ).not.toBeInTheDocument()

    expect(remove).not.toHaveBeenCalled()
  })

  it('holds the dialog open with both buttons disabled while the delete runs', async () => {
    let finishDelete!: () => void
    const remove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDelete = resolve
        }),
    )
    installBridge({ remove })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(remove).toHaveBeenCalledWith(1)
    const confirm = screen.getByRole('button', { name: 'در حال حذف...' })
    expect(confirm).toBeDisabled()
    expect(confirm.querySelector('svg')).toHaveClass('size-4', 'animate-spin')
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(() => finishDelete())
    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
  })

  it('deletes the document, returns home, and re-reads the count', async () => {
    let documentCount = 1
    const count = vi.fn(async () => documentCount)
    const remove = vi.fn(async () => {
      documentCount = 0
    })
    const { get } = installBridge({ count, remove })
    const user = userEvent.setup()

    const { router } = renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۱)' })

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(await screen.findByRole('button', { name: 'بله' }))

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith(1)
    expect(count).toHaveBeenCalledTimes(2)

    await act(() => router.history.back())

    expect(router.state.location.pathname).toBe('/')
    expect(
      screen.getByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('سندی با این شناسه پیدا نشد.'),
    ).not.toBeInTheDocument()

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('does not report a failed save after the document is deleted', async () => {
    let rejectSave!: (error: Error) => void
    const save = vi.fn(
      () =>
        new Promise<TestDocument>((_resolve, reject) => {
          rejectSave = reject
        }),
    )
    installBridge({ save })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')

    await vi.waitFor(
      () => {
        expect(save).toHaveBeenCalledOnce()
      },
      { timeout: 1_500 },
    )

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()

    await act(async () => {
      rejectSave(new Error('The saveDocument operation failed'))
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(isDocumentSaving()).toBe(false))
    expect(
      screen.queryByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()
  })

  it('reports a failed delete with an error toast and keeps the dialog open for another try', async () => {
    let attempts = 0
    const remove = vi.fn((): Promise<void> => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(
            new Error(
              'The deleteDocument operation failed (injected by --with-db-failure)',
            ),
          )
        : Promise.resolve()
    })
    installBridge({ remove })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(await screen.findByRole('button', { name: 'بله' }))

    expect(
      await screen.findByText('حذف سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The deleteDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'انصراف' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'بله' })).toBeEnabled()
    expect(screen.queryByText('سند حذف شد.')).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'بله' }))
    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(remove).toHaveBeenCalledTimes(2)
  })

  it('reports a row delete that cannot reach the bridge instead of closing silently', async () => {
    const documents = [{ ...storedDocument, id: 1, title: 'یادداشت' }]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    const dialog = await screen.findByRole('alertdialog')

    Reflect.deleteProperty(window, 'WordApp')
    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(
      await screen.findByText('حذف سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'یادداشت', hidden: true }),
    ).toBeInTheDocument()
  })

  it('reuses the cached count when the home page is revisited without a write', async () => {
    const { count, get } = installBridge()
    const user = userEvent.setup()

    const { router } = renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(screen.getByText('(۰)')).not.toHaveClass('animate-pulse')
    expect(get).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledOnce()
  })

  it('re-reads the count once after a document is created', async () => {
    const { create, count } = installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    await user.click(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()

    expect(create).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledTimes(2)
  })

  it('reports a failed create with an error toast and stays on the home page', async () => {
    const create = vi.fn(async () => {
      throw new Error(
        'The createDocument operation failed (injected by --with-db-failure)',
      )
    })
    const { count } = installBridge({ create })
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(
      await screen.findByRole('button', {
        name: 'افزودن سند',
      }),
    )

    expect(
      await screen.findByText('افزودن سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The createDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    expect(
      screen.getByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeEnabled()
    expect(count).toHaveBeenCalledOnce()
  })

  it('shows no toast when the create succeeds and opens the new document', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(
      await screen.findByRole('button', {
        name: 'افزودن سند',
      }),
    )

    await screen.findByRole('heading', { name: 'بدون عنوان' })

    expect(
      screen.queryByText('افزودن سند ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()
  })

  it('reads a document row once and reuses it when the page is opened again', async () => {
    const { get, count } = installBridge()
    const user = userEvent.setup()

    const { router } = renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    expect(get).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledOnce()
  })

  it('lists the documents newest first with linked titles, relative dates, and row options', async () => {
    const fixedNow = new Date(2026, 6, 8, 15, 0).getTime()
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    const newest = {
      ...storedDocument,
      id: 2,
      title: 'گزارش سالانه',
      createdAt: fixedNow - 5 * 60_000,
      updatedAt: fixedNow - 5 * 60_000,
    }
    const oldest = {
      ...storedDocument,
      id: 1,
      title: 'پیش نویس',
      createdAt: fixedNow - 26 * 60 * 60_000,
      updatedAt: fixedNow - 26 * 60 * 60_000,
    }
    installDocumentsBridge([newest, oldest])

    renderRoute('/')
    await screen.findByRole('link', { name: 'گزارش سالانه' })

    const [headerTable, bodyTable] = screen.getAllByRole('table')
    expect(headerTable).toHaveClass('table-fixed')
    expect(bodyTable).toHaveClass('table-fixed')
    const headerColWidths = Array.from(headerTable.querySelectorAll('col')).map(
      (col) => col.className,
    )
    const bodyColWidths = Array.from(bodyTable.querySelectorAll('col')).map(
      (col) => col.className,
    )
    expect(headerColWidths).toEqual(['w-[60%]', 'w-[20%]', 'w-[20%]'])
    expect(bodyColWidths).toEqual(headerColWidths)
    expect(
      screen.getByRole('columnheader', { name: 'تاریخ ایجاد' }),
    ).toHaveClass('text-center')
    expect(
      screen.getAllByRole('columnheader').map((head) => head.textContent),
    ).toEqual(['عنوان', 'تاریخ ایجاد', ''])

    const titleLink = screen.getByRole('link', { name: 'گزارش سالانه' })
    expect(titleLink).toHaveClass('block', 'break-words')
    expect(titleLink).not.toHaveClass('truncate')
    expect(titleLink).not.toHaveClass('hover:underline')
    const titleCell = titleLink.closest('td')
    expect(titleCell).toHaveClass('whitespace-normal')
    expect(titleCell).not.toHaveClass('whitespace-nowrap')

    expect(
      within(bodyTable)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['گزارش سالانه', 'پیش نویس'])

    expect(screen.getByRole('cell', { name: '۵ دقیقه ی پیش' })).toHaveClass(
      'text-center',
    )
    expect(screen.getByRole('cell', { name: '۱ روز پیش' })).toHaveClass(
      'text-center',
    )

    const optionsButtons = screen.getAllByRole('button', { name: 'گزینه ها' })
    expect(optionsButtons).toHaveLength(2)
    const optionsCell = optionsButtons[0]?.closest('td')
    expect(optionsCell).not.toHaveClass('text-center')
    expect(optionsCell?.querySelector('div')).toHaveClass('justify-end')

    expect(headerTable.closest('[data-slot="scroll-area-viewport"]')).toBeNull()
    expect(
      bodyTable.closest('[data-slot="scroll-area-viewport"]'),
    ).not.toBeNull()
    expect(bodyTable.closest('[data-slot="scroll-area"]')).toHaveClass(
      '[&_[data-slot=table-container]]:overflow-visible',
    )
  })

  it('shows the untitled placeholder in the list and on the document page', async () => {
    const untitled = { ...storedDocument, title: null }
    installDocumentsBridge([untitled])
    const user = userEvent.setup()

    renderRoute('/')

    const titleLink = await screen.findByRole('link', {
      name: 'عنوانی انتخاب نشده است.',
    })
    await user.click(titleLink)

    expect(
      await screen.findByRole('heading', {
        name: 'عنوانی انتخاب نشده است.',
      }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('heading', { name: 'عنوانی انتخاب نشده است.' }),
    )
    expect(
      await screen.findByRole<HTMLInputElement>('textbox', {
        name: 'عنوان سند',
      }),
    ).toHaveValue('')
  })

  it('asks to delete an untitled document without using the placeholder as its title', async () => {
    const untitled = { ...storedDocument, title: null }
    installDocumentsBridge([untitled])
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'عنوانی انتخاب نشده است.' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        'آیا مطمئن هستید که می خواهید این سند را حذف کنید؟',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText(/عنوانی انتخاب نشده است/),
    ).not.toBeInTheDocument()
  })

  it('shows a centered message while no documents are stored', async () => {
    installBridge()

    renderRoute('/')

    const message = await screen.findByText('هنوز سندی ثبت نشده است.')
    expect(message.parentElement).toHaveClass('items-center', 'justify-center')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('treats a whitespace-only search as empty and hides the clear-results button', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByText('هنوز سندی ثبت نشده است.')

    await user.type(searchInput(), '   ')

    expect(
      screen.queryByRole('button', { name: 'نمایش همه ی سندها' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('هنوز سندی ثبت نشده است.')).toBeInTheDocument()
  })

  it('shows the relative age with the full Persian date and a spaced ، in a tooltip', async () => {
    const fixedNow = new Date(2026, 6, 8, 15, 0).getTime()
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    const recent = {
      ...storedDocument,
      id: 1,
      title: 'امروز',
      createdAt: fixedNow - 5 * 60_000,
      updatedAt: fixedNow - 5 * 60_000,
    }
    const older = {
      ...storedDocument,
      id: 2,
      title: 'دیروز',
      createdAt: fixedNow - 26 * 60 * 60_000,
      updatedAt: fixedNow - 26 * 60 * 60_000,
    }
    const justCreated = {
      ...storedDocument,
      id: 3,
      title: 'همین حالا',
      createdAt: fixedNow,
      updatedAt: fixedNow,
    }
    installDocumentsBridge([recent, older, justCreated])
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'امروز' })

    expect(screen.getByText('۵ دقیقه ی پیش')).toBeInTheDocument()
    expect(screen.getByText('۱ روز پیش')).toBeInTheDocument()
    expect(screen.getByText('همین الان')).toBeInTheDocument()

    await user.hover(screen.getByText('۵ دقیقه ی پیش'))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'چهارشنبه 17 تیر ماه 1405 ، 14:55',
    )
  })

  it('shows a muted edited age under the title for updated documents, with its own tooltip', async () => {
    const fixedNow = new Date(2026, 6, 8, 15, 0).getTime()
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    const edited = {
      ...storedDocument,
      id: 1,
      title: 'گزارش',
      createdAt: fixedNow - 26 * 60 * 60_000,
      updatedAt: fixedNow - 5 * 60_000,
    }
    const neverEdited = {
      ...storedDocument,
      id: 2,
      title: 'یادداشت',
      createdAt: fixedNow - 5 * 60_000,
      updatedAt: fixedNow - 5 * 60_000,
    }
    installDocumentsBridge([edited, neverEdited])
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'گزارش' })

    const editedLine = screen.getByText('ویرایش شده: ۵ دقیقه ی پیش')
    expect(editedLine).toHaveClass('text-xs', 'text-muted-foreground')
    expect(editedLine.previousElementSibling).toBe(
      screen.getByRole('link', { name: 'گزارش' }),
    )
    expect(
      screen.getByRole('link', { name: 'یادداشت' }).closest('td'),
    ).not.toHaveTextContent('ویرایش شده')
    expect(screen.getAllByText(/ویرایش شده:/)).toHaveLength(1)

    await user.hover(editedLine)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'چهارشنبه 17 تیر ماه 1405 ، 14:55',
    )
  })

  it('refreshes relative ages once a minute while the list stays open', async () => {
    const fixedNow = new Date(2026, 6, 8, 15, 0).getTime()
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)
    const recent = {
      ...storedDocument,
      id: 1,
      title: 'امروز',
      createdAt: fixedNow - 5 * 60_000,
      updatedAt: fixedNow - 5 * 60_000,
    }
    installDocumentsBridge([recent])

    renderRoute('/')
    await act(async () => {})

    expect(screen.getByText('۵ دقیقه ی پیش')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(screen.getByText('۶ دقیقه ی پیش')).toBeInTheDocument()
    expect(screen.queryByText('۵ دقیقه ی پیش')).not.toBeInTheDocument()
  })

  it('opens the document page when a row title is clicked', async () => {
    const first = { ...storedDocument, id: 1, title: 'یادداشت' }
    const second = { ...storedDocument, id: 2, title: 'گزارش' }
    const { get } = installDocumentsBridge([first, second])
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(await screen.findByRole('link', { name: 'گزارش' }))

    expect(
      await screen.findByRole('heading', { name: 'گزارش' }),
    ).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(2)
  })

  it('keeps the home page usable with a centered loader while the first list read is in flight', async () => {
    let finishList!: (documents: Array<TestDocument>) => void
    const list = vi.fn(
      (_options: DocumentListOptions) =>
        new Promise<Array<TestDocument>>((resolve) => {
          finishList = resolve
        }),
    )
    installBridge({ list })

    renderRoute('/')

    const status = await screen.findByRole('status', {
      name: 'در حال بارگذاری سندها',
    })
    expect(status).toHaveClass('items-center', 'justify-center')
    expect(status).toHaveTextContent('در حال بارگذاری سندها...')
    expect(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeEnabled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )

    await act(() => finishList([{ ...storedDocument, title: 'یادداشت' }]))

    expect(
      await screen.findByRole('link', { name: 'یادداشت' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sorts the list newest first by default and oldest first from the order select', async () => {
    const documents = [
      {
        ...storedDocument,
        id: 3,
        title: 'سند 3',
        createdAt: 3_000,
        updatedAt: 3_000,
      },
      {
        ...storedDocument,
        id: 2,
        title: 'سند 2',
        createdAt: 2_000,
        updatedAt: 2_000,
      },
      {
        ...storedDocument,
        id: 1,
        title: 'سند 1',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ]
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 3' })
    const orderSelect = screen.getByRole('combobox', {
      name: 'ترتیب بر اساس تاریخ ایجاد',
    })
    expect(orderSelect).toBeEnabled()
    const addButton = screen.getByRole('button', {
      name: 'افزودن سند',
    })
    const selectionToggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    expect(
      addButton.compareDocumentPosition(orderSelect) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      orderSelect.compareDocumentPosition(selectionToggle) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('ترتیب بر اساس تاریخ ایجاد')).toHaveClass('text-sm')
    expect(orderSelect).toHaveClass('text-sm')
    expect(orderSelect).not.toHaveClass('text-muted-foreground')
    expect(orderSelect).toHaveTextContent('جدید به قدیم')
    expect(
      screen
        .getAllByRole('link', { name: /^سند / })
        .map((link) => link.textContent),
    ).toEqual(['سند 3', 'سند 2', 'سند 1'])
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )

    await user.click(screen.getByText('ترتیب بر اساس تاریخ ایجاد'))
    await user.click(
      await screen.findByRole('option', { name: 'قدیم به جدید' }),
    )

    expect(orderSelect).toHaveTextContent('قدیم به جدید')
    expect(
      screen
        .getAllByRole('link', { name: /^سند / })
        .map((link) => link.textContent),
    ).toEqual(['سند 1', 'سند 2', 'سند 3'])
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'oldest',
      },
      expect.any(String),
    )
  })

  it('returns to the first page when the order changes', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(paginationPageLink(2))
    await screen.findByRole('link', {
      name: `سند ${documentPageSize + 1}`,
    })

    await user.click(
      screen.getByRole('combobox', { name: 'ترتیب بر اساس تاریخ ایجاد' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'قدیم به جدید' }),
    )

    expect(paginationPageLink(1)).toHaveAttribute('aria-current', 'page')
    await screen.findByRole('link', { name: `سند ${documents.length}` })
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'oldest',
      },
      expect.any(String),
    )
  })

  it('keeps the chosen order after opening a document and returning home', async () => {
    const documents = [
      {
        ...storedDocument,
        id: 3,
        title: 'سند 3',
        createdAt: 3_000,
        updatedAt: 3_000,
      },
      {
        ...storedDocument,
        id: 2,
        title: 'سند 2',
        createdAt: 2_000,
        updatedAt: 2_000,
      },
      {
        ...storedDocument,
        id: 1,
        title: 'سند 1',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
    ]
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 3' })
    await user.click(
      screen.getByRole('combobox', { name: 'ترتیب بر اساس تاریخ ایجاد' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'قدیم به جدید' }),
    )
    await screen.findByRole('link', { name: 'سند 1' })

    await user.click(screen.getByRole('link', { name: 'سند 1' }))
    await screen.findByRole('heading', { name: 'سند 1' })
    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    const orderSelect = await screen.findByRole('combobox', {
      name: 'ترتیب بر اساس تاریخ ایجاد',
    })
    expect(orderSelect).toHaveTextContent('قدیم به جدید')
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'oldest',
      },
      expect.any(String),
    )
  })

  it('places the title search before the created-at order select', async () => {
    const documents = [{ ...storedDocument, title: 'گزارش' }]
    installDocumentsBridge(documents)

    renderRoute('/')
    await screen.findByRole('link', { name: 'گزارش' })

    const search = searchInput()
    const order = screen.getByRole('combobox', {
      name: 'ترتیب بر اساس تاریخ ایجاد',
    })

    expect(screen.getByText('جستجوی عنوان')).toHaveClass('text-sm')
    expect(
      search.compareDocumentPosition(order) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(search).toHaveClass('h-8', 'text-sm')
    expect(search).toHaveAttribute('placeholder', 'عنوان سند')
    expect(search).not.toHaveClass('text-muted-foreground')
  })

  it('filters titles after the debounce and restores every row when cleared', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'گزارش سالانه' },
      { ...storedDocument, id: 2, title: 'یادداشت' },
      { ...storedDocument, id: 3, title: 'گزارش ماهانه' },
    ]
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.type(searchInput(), 'گزارش')

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۲)' }),
    ).toBeInTheDocument()
    await screen.findByRole('link', { name: 'گزارش ماهانه' })
    expect(
      screen.queryByRole('link', { name: 'یادداشت' }),
    ).not.toBeInTheDocument()

    const searchCalls = vi
      .mocked(list)
      .mock.calls.filter(([options]) => options.search !== undefined)
    expect(searchCalls).toHaveLength(1)
    expect(searchCalls[0]?.[0]).toEqual({
      offset: 0,
      limit: documentPageSize,
      order: 'newest',
      search: 'گزارش',
    })

    await user.click(screen.getByRole('button', { name: 'پاک کردن جستجو' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۳)' }),
    ).toBeInTheDocument()
    await screen.findByRole('link', { name: 'یادداشت' })
    expect(searchInput()).toHaveValue('')
  })

  it('shows a no-results message for an unmatched title and clears it', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'گزارش' },
      { ...storedDocument, id: 2, title: 'یادداشت' },
    ]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'گزارش' })

    await user.type(searchInput(), 'ناموجود')

    const message = await screen.findByText('سندی با این عنوان پیدا نشد.')
    expect(message.parentElement).toHaveClass(
      'items-center',
      'justify-center',
      'flex-col',
    )
    expect(
      screen.getByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'نمایش همه ی سندها' }))

    await screen.findByRole('link', { name: 'گزارش' })
    expect(
      screen.queryByText('سندی با این عنوان پیدا نشد.'),
    ).not.toBeInTheDocument()
  })

  it('keeps the rows visible and pulses them while a filtered read is in flight', async () => {
    const matching = { ...storedDocument, id: 1, title: 'گزارش' }
    const other = { ...storedDocument, id: 2, title: 'یادداشت' }
    let finishSearch!: (documents: Array<TestDocument>) => void
    const list = vi.fn(
      (options: DocumentListOptions): Promise<Array<TestDocument>> => {
        if (options.search === 'گزارش') {
          return new Promise<Array<TestDocument>>((resolve) => {
            finishSearch = resolve
          })
        }
        return Promise.resolve(documentListPage([matching, other], options))
      },
    )
    installBridge({
      list,
      count: vi.fn(async (search?: string) => (search === 'گزارش' ? 1 : 2)),
    })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.type(searchInput(), 'گزارش')

    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'گزارش' }),
        expect.any(String),
      ),
    )

    const pending = screen.getByRole('status', {
      name: 'در حال جستجوی عنوان',
    })
    expect(pending).toHaveClass('size-4', 'animate-spin')
    expect(documentsTable()).toHaveClass('animate-pulse', 'pointer-events-none')
    expect(documentsTable()).toHaveAttribute('inert')
    expect(screen.getByRole('link', { name: 'یادداشت' })).toBeInTheDocument()

    await act(() => finishSearch([matching]))

    await screen.findByRole('heading', { name: 'مستندات (۱)' })
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('status', { name: 'در حال جستجوی عنوان' }),
      ).not.toBeInTheDocument(),
    )
    expect(documentsTable()).not.toHaveClass('animate-pulse')
    expect(documentsTable()).not.toHaveAttribute('inert')
  })

  it('cancels the in-flight search request as soon as another title is typed', async () => {
    const other = { ...storedDocument, id: 2, title: 'یادداشت' }
    const matching = { ...storedDocument, id: 1, title: 'گزارش سالانه' }
    const stale = { ...storedDocument, id: 3, title: 'گزارش قدیمی' }
    let searchRequestId: string | undefined
    let finishStaleSearch:
      ((documents: Array<TestDocument>) => void) | undefined
    let rejectStaleSearch: ((reason?: unknown) => void) | undefined
    const list = vi.fn(
      (
        options: DocumentListOptions,
        requestId: string,
      ): Promise<Array<TestDocument>> => {
        if (options.search === 'گ') {
          searchRequestId = requestId
          return new Promise<Array<TestDocument>>((resolve, reject) => {
            finishStaleSearch = resolve
            rejectStaleSearch = reject
          })
        }
        if (options.search === 'گزارش') {
          return Promise.resolve([matching])
        }
        return Promise.resolve([other])
      },
    )
    const cancel = vi.fn((requestId: string) => {
      if (requestId === searchRequestId) {
        rejectStaleSearch?.(
          new DOMException('The search was canceled', 'AbortError'),
        )
      }
    })
    installBridge({
      list,
      cancel,
      count: vi.fn(async (search?: string) => (search === undefined ? 2 : 1)),
    })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    const input = searchInput()
    await user.type(input, 'گ')
    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'گ' }),
        expect.any(String),
      ),
    )

    await user.type(input, 'زارش')

    expect(cancel).toHaveBeenCalledWith(searchRequestId)
    await screen.findByRole('link', { name: 'گزارش سالانه' })

    await act(() => finishStaleSearch?.([stale]))

    expect(
      screen.queryByRole('link', { name: 'گزارش قدیمی' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'گزارش سالانه' }),
    ).toBeInTheDocument()
  })

  it('re-reads the list and the count when a canceled search change is undone', async () => {
    const document = { ...storedDocument, title: 'یادداشت' }
    let documents = [document]
    let holdReads = false
    const heldReads = new Map<string, (reason: unknown) => void>()
    const hold = (requestId: string): Promise<never> =>
      new Promise((_resolve, reject) => {
        heldReads.set(requestId, reject)
      })
    const list = vi.fn((options: DocumentListOptions, requestId: string) =>
      holdReads
        ? hold(requestId)
        : Promise.resolve(documentListPage(documents, options)),
    )
    const count = vi.fn((search: string | undefined, requestId: string) =>
      holdReads
        ? hold(requestId)
        : Promise.resolve(
            search === undefined
              ? documents.length
              : documents.filter(
                  (row) => row.title?.includes(search.trim()) ?? false,
                ).length,
          ),
    )
    const cancel = vi.fn((requestId: string) => {
      const reject = heldReads.get(requestId)
      if (reject !== undefined) {
        heldReads.delete(requestId)
        holdReads = false
        reject(new DOMException('The read was canceled', 'AbortError'))
      }
    })
    const remove = vi.fn(async (id: number) => {
      documents = documents.filter((row) => row.id !== id)
      holdReads = true
    })
    installBridge({ list, count, cancel, remove })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'بله',
      }),
    )
    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()

    const input = searchInput()
    await user.type(input, 'x')
    expect(screen.getByRole('link', { name: 'یادداشت' })).toBeInTheDocument()

    await user.type(input, '{backspace}')
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'یادداشت' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
  })

  it('returns to the first page when the title search changes', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(paginationPageLink(2))
    await screen.findByRole('link', {
      name: `سند ${documentPageSize + 1}`,
    })

    await user.type(searchInput(), 'سند')

    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        {
          offset: 0,
          limit: documentPageSize,
          order: 'newest',
          search: 'سند',
        },
        expect.any(String),
      ),
    )
    expect(
      await screen.findByRole('link', { name: 'سند 1' }),
    ).toBeInTheDocument()
    expect(paginationPageLink(1)).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the title search after opening a document and returning home', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'گزارش سالانه' },
      { ...storedDocument, id: 2, title: 'یادداشت' },
    ]
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })
    await user.type(searchInput(), 'گزارش')
    await screen.findByRole('link', { name: 'گزارش سالانه' })

    await user.click(screen.getByRole('link', { name: 'گزارش سالانه' }))
    await screen.findByRole('heading', { name: 'گزارش سالانه' })
    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('searchbox', { name: 'جستجوی عنوان' }),
    ).toHaveValue('گزارش')
    const main = screen.getByRole('main')
    await within(main).findByRole('link', { name: 'گزارش سالانه' })
    expect(
      within(main).queryByRole('link', { name: 'یادداشت' }),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'newest',
        search: 'گزارش',
      },
      expect.any(String),
    )
  })

  it('keeps the stale rows and pulses the table while the list re-reads', async () => {
    let reads = 0
    let finishReread!: (documents: Array<TestDocument>) => void
    const list = vi.fn(
      (options: DocumentListOptions): Promise<Array<TestDocument>> => {
        reads += 1
        if (reads > 1) {
          return new Promise<Array<TestDocument>>((resolve) => {
            finishReread = resolve
          })
        }
        return Promise.resolve(documentListPage([storedDocument], options))
      },
    )
    installBridge({ list })
    const user = userEvent.setup()

    const { queryClient } = renderRoute('/')
    await screen.findByRole('link', { name: 'بدون عنوان' })

    const orderSelect = screen.getByRole('combobox', {
      name: 'ترتیب بر اساس تاریخ ایجاد',
    })
    const selectionToggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    expect(orderSelect).toBeEnabled()
    expect(selectionToggle).toBeEnabled()
    expect(documentsTable()).not.toHaveClass('animate-pulse')

    await act(async () => {
      void queryClient.invalidateQueries({
        queryKey: documentsQuery(1).queryKey,
      })
    })

    await vi.waitFor(() =>
      expect(documentsTable()).toHaveClass('animate-pulse'),
    )
    expect(documentsTable()).toHaveClass('pointer-events-none')
    expect(documentsTable()).toHaveAttribute('inert')
    expect(orderSelect).toBeDisabled()
    expect(selectionToggle).toBeDisabled()
    await user.click(screen.getByText('ترتیب بر اساس تاریخ ایجاد'))
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بدون عنوان' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(() => finishReread([{ ...storedDocument, title: 'عنوان تازه' }]))

    expect(
      await screen.findByRole('link', { name: 'عنوان تازه' }),
    ).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(documentsTable()).not.toHaveClass('animate-pulse'),
    )
    expect(documentsTable()).not.toHaveAttribute('inert')
    await vi.waitFor(() => expect(orderSelect).toBeEnabled())
    await vi.waitFor(() => expect(selectionToggle).toBeEnabled())
  })

  it('reports a failed list read with an error and a retry button, and recovers the table when pressed', async () => {
    let attempts = 0
    const list = vi.fn(
      (options: DocumentListOptions): Promise<Array<TestDocument>> => {
        attempts += 1
        return attempts === 1
          ? Promise.reject(
              new Error(
                'The listDocuments operation failed (injected by --with-db-failure)',
              ),
            )
          : Promise.resolve(documentListPage([storedDocument], options))
      },
    )
    installBridge({ list })
    const user = userEvent.setup()

    renderRoute('/')

    const message = await screen.findByText('بارگذاری سندها ناموفق بود.')
    expect(message.parentElement).toHaveClass(
      'items-center',
      'justify-center',
      'flex-col',
    )
    expect(
      screen.queryByText(
        'The listDocuments operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeEnabled()

    const retry = screen.getByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(retry).toHaveAttribute('data-variant', 'outline')
    expect(retry).toHaveAttribute('data-size', 'default')
    expect(retry.querySelector('svg')).not.toHaveClass('text-destructive')

    await user.click(retry)

    expect(
      await screen.findByRole('link', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سندها ناموفق بود.'),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('shows the list retry instead of a blank table when the bridge is missing', async () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderRoute('/')

    const message = await screen.findByText('بارگذاری سندها ناموفق بود.')
    expect(message.parentElement).toHaveClass(
      'items-center',
      'justify-center',
      'flex-col',
    )
    expect(
      within(message.parentElement as HTMLElement).getByRole('button', {
        name: 'تلاش دوباره',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the centered loader while a retry from a failed list read is in flight', async () => {
    let attempts = 0
    let finishRetry!: (documents: Array<TestDocument>) => void
    const list = vi.fn(
      (_options: DocumentListOptions): Promise<Array<TestDocument>> => {
        attempts += 1
        if (attempts === 1) {
          return Promise.reject(new Error('list read failed'))
        }
        return new Promise<Array<TestDocument>>((resolve) => {
          finishRetry = resolve
        })
      },
    )
    installBridge({ list })
    const user = userEvent.setup()

    renderRoute('/')

    await user.click(
      await screen.findByRole('button', {
        name: 'تلاش دوباره',
      }),
    )

    expect(
      await screen.findByRole('status', { name: 'در حال بارگذاری سندها' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سندها ناموفق بود.'),
    ).not.toBeInTheDocument()

    await act(() => finishRetry([storedDocument]))

    expect(
      await screen.findByRole('link', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the retry button busy with a spinner while a stale list re-reads', async () => {
    let reads = 0
    let finishRetry!: (documents: Array<TestDocument>) => void
    const list = vi.fn(
      (options: DocumentListOptions): Promise<Array<TestDocument>> => {
        reads += 1
        if (reads === 1) {
          return Promise.resolve(documentListPage([storedDocument], options))
        }
        if (reads === 2) {
          return Promise.reject(new Error('list re-read failed'))
        }
        return new Promise<Array<TestDocument>>((resolve) => {
          finishRetry = resolve
        })
      },
    )
    installBridge({ list })
    const user = userEvent.setup()

    const { queryClient } = renderRoute('/')
    await screen.findByRole('link', { name: 'بدون عنوان' })

    await act(async () => {
      void queryClient.invalidateQueries({
        queryKey: documentsQuery(1).queryKey,
      })
    })

    await user.click(
      await screen.findByRole('button', {
        name: 'تلاش دوباره',
      }),
    )

    const busy = screen.getByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(busy).toBeDisabled()
    expect(busy.querySelector('svg')).toHaveClass('size-4', 'animate-spin')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await act(() => finishRetry([storedDocument]))

    expect(
      await screen.findByRole('link', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'تلاش دوباره',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows the list retry as a labeled button without a tooltip', async () => {
    const list = vi.fn(
      async (_options: DocumentListOptions): Promise<Array<TestDocument>> => {
        throw new Error('list read failed')
      },
    )
    installBridge({ list })
    const user = userEvent.setup()

    renderRoute('/')

    const retry = await screen.findByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(retry.querySelector('svg')).toHaveClass('lucide-refresh-cw')
    expect(retry).toHaveTextContent('تلاش دوباره')

    await user.hover(retry)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('pages through documents fifty at a time and disables the first and last page', async () => {
    const documents = Array.from(
      { length: documentPageSize * 2 + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    expect(screen.getAllByRole('link', { name: /^سند / })).toHaveLength(
      documentPageSize,
    )
    expect(
      screen.queryByRole('link', { name: `سند ${documentPageSize + 1}` }),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledExactlyOnceWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
    expect(paginationPageLink(1)).toHaveAttribute('aria-current', 'page')
    expect(
      within(documentsPagination()).getByRole('link', {
        name: 'صفحه ی قبلی',
      }),
    ).toHaveAttribute('aria-disabled', 'true')

    await user.click(paginationPageLink(2))

    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })
    expect(screen.getAllByRole('link', { name: /^سند / })).toHaveLength(
      documentPageSize,
    )
    expect(
      screen.queryByRole('link', { name: 'سند 1' }),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: documentPageSize,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
    expect(paginationPageLink(2)).toHaveAttribute('aria-current', 'page')
    expect(
      within(documentsPagination()).getByRole('link', {
        name: 'صفحه ی قبلی',
      }),
    ).toHaveAttribute('aria-disabled', 'false')

    await user.click(
      within(documentsPagination()).getByRole('link', {
        name: 'صفحه ی بعدی',
      }),
    )

    await screen.findByRole('link', {
      name: `سند ${documentPageSize * 2 + 1}`,
    })
    expect(screen.getAllByRole('link', { name: /^سند / })).toHaveLength(10)
    expect(
      screen.queryByRole('link', {
        name: `سند ${documentPageSize * 2 + 11}`,
      }),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: documentPageSize * 2,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
    expect(paginationPageLink(3)).toHaveAttribute('aria-current', 'page')
    expect(
      within(documentsPagination()).getByRole('link', {
        name: 'صفحه ی بعدی',
      }),
    ).toHaveAttribute('aria-disabled', 'true')

    await user.click(paginationPageLink(1))

    await screen.findByRole('link', { name: 'سند 1' })
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('keeps the previous page visible and disables pagination while the next page loads', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    let finishPageTwo!: (documents: Array<TestDocument>) => void
    const list = vi.fn(
      (options: DocumentListOptions): Promise<Array<TestDocument>> => {
        if (options.offset === documentPageSize) {
          return new Promise<Array<TestDocument>>((resolve) => {
            finishPageTwo = resolve
          })
        }
        return Promise.resolve(documentListPage(documents, options))
      },
    )
    installBridge({ list, count: vi.fn(async () => documents.length) })
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })

    await user.click(paginationPageLink(2))

    expect(screen.getByRole('link', { name: 'سند 1' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: `سند ${documentPageSize + 1}` }),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: documentPageSize,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
    expect(documentsTable()).toHaveClass('animate-pulse', 'pointer-events-none')
    expect(documentsTable()).toHaveAttribute('inert')

    for (const name of ['صفحه ی قبلی', 'صفحه ی ۱', 'صفحه ی ۲', 'صفحه ی بعدی']) {
      const link = within(documentsPagination()).getByRole('link', { name })
      expect(link).toHaveAttribute('aria-disabled', 'true')
      expect(link).toHaveClass('pointer-events-none', 'opacity-50')
    }

    await act(() => finishPageTwo(documents.slice(documentPageSize)))

    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })
    expect(
      screen.getByRole('link', { name: `سند ${documents.length}` }),
    ).toBeInTheDocument()
    expect(documentsTable()).not.toHaveClass('animate-pulse')
    expect(documentsTable()).not.toHaveAttribute('inert')
    expect(
      within(documentsPagination()).getByRole('link', {
        name: 'صفحه ی ۱',
      }),
    ).toHaveAttribute('aria-disabled', 'false')
  })

  it('shows the list error when the next page fails and retries that page', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    let pageTwoAttempts = 0
    const list = vi.fn(
      (options: DocumentListOptions): Promise<Array<TestDocument>> => {
        if (options.offset === documentPageSize) {
          pageTwoAttempts += 1
          if (pageTwoAttempts === 1) {
            return Promise.reject(new Error('next page read failed'))
          }
        }
        return Promise.resolve(documentListPage(documents, options))
      },
    )
    installBridge({ list, count: vi.fn(async () => documents.length) })
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(paginationPageLink(2))

    expect(
      await screen.findByText('بارگذاری سندها ناموفق بود.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'سند 1' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))

    expect(
      await screen.findByRole('link', {
        name: `سند ${documentPageSize + 1}`,
      }),
    ).toBeInTheDocument()
    expect(pageTwoAttempts).toBe(2)
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: documentPageSize,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
  })

  it('replaces the endless page loader with a retry when the count fails on a later page', async () => {
    const documents = Array.from(
      { length: documentPageSize + 1 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    let countReads = 0
    const count = vi.fn(async () => {
      countReads += 1
      if (countReads === 2) {
        throw new Error('count read failed')
      }
      return countReads === 1 ? documentPageSize + 1 : documentPageSize
    })
    let pageTwoDocuments = documents.slice(documentPageSize)
    const list = vi.fn(async (options: DocumentListOptions) =>
      options.offset === documentPageSize
        ? [...pageTwoDocuments]
        : documentListPage(documents, options),
    )
    installBridge({ list, count })
    const user = userEvent.setup()
    const { queryClient } = renderRoute('/')

    await screen.findByRole('heading', {
      name: `مستندات (${formatNumber(documentPageSize + 1)})`,
    })
    await user.click(paginationPageLink(2))
    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })

    pageTwoDocuments = []
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })
    })
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: documentsQuery(2).queryKey,
      })
    })

    expect(
      await screen.findByText('بارگذاری سندها ناموفق بود.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: 'در حال بارگذاری سندها' }),
    ).not.toBeInTheDocument()

    const listFailure = screen.getByText('بارگذاری سندها ناموفق بود.')
    await user.click(
      within(listFailure.parentElement as HTMLElement).getByRole('button', {
        name: 'تلاش دوباره',
      }),
    )

    expect(
      await screen.findByRole('link', { name: 'سند 1' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سندها ناموفق بود.'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: `مستندات (${formatNumber(documentPageSize)})`,
      }),
    ).toBeInTheDocument()
  })

  it('keeps the loader while a saved later page is clamped to a page that is still loading', async () => {
    const documents = Array.from(
      { length: documentPageSize + 1 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    let pageTwoDocuments = documents.slice(documentPageSize)
    let countValue = documents.length
    let holdFirstPage = false
    let finishFirstPage!: (documents: Array<TestDocument>) => void
    const count = vi.fn(async () => countValue)
    const list = vi.fn(
      (options: DocumentListOptions): Promise<Array<TestDocument>> => {
        if (options.offset === documentPageSize) {
          return Promise.resolve(pageTwoDocuments)
        }

        if (holdFirstPage) {
          return new Promise<Array<TestDocument>>((resolve) => {
            finishFirstPage = resolve
          })
        }

        return Promise.resolve(documentListPage(documents, options))
      },
    )
    installBridge({
      count,
      list,
      get: vi.fn(async (id: number) =>
        documents.find((document) => document.id === id),
      ),
    })
    const user = userEvent.setup()
    const { queryClient } = renderRoute('/documents/1')

    await screen.findByRole('heading', { name: 'سند 1' })
    saveHomePage(2)
    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })

    pageTwoDocuments = []
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: documentsQuery(2).queryKey,
      })
    })
    expect(
      await screen.findByText('بارگذاری سندها ناموفق بود.'),
    ).toBeInTheDocument()

    holdFirstPage = true
    countValue = documentPageSize
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })
    })

    await vi.waitFor(() => expect(finishFirstPage).toBeTypeOf('function'))
    expect(
      screen.getByRole('status', { name: 'در حال بارگذاری سندها' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سندها ناموفق بود.'),
    ).not.toBeInTheDocument()

    await act(() => finishFirstPage(documents.slice(0, documentPageSize)))

    expect(
      await screen.findByRole('link', { name: `سند ${documentPageSize}` }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: `مستندات (${formatNumber(documentPageSize)})`,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سندها ناموفق بود.'),
    ).not.toBeInTheDocument()
  })

  it('remembers the page and scroll position after opening a document and returning to it', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(paginationPageLink(2))
    const pageTwoFirstTitle = `سند ${documentPageSize + 1}`
    await screen.findByRole('link', { name: pageTwoFirstTitle })

    await act(() => {
      listViewport().scrollTop = 400
    })

    await user.click(screen.getByRole('link', { name: pageTwoFirstTitle }))
    await screen.findByRole('heading', { name: pageTwoFirstTitle })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    await within(screen.getByRole('main')).findByRole('link', {
      name: pageTwoFirstTitle,
    })
    expect(
      screen.queryByRole('link', { name: 'سند 1' }),
    ).not.toBeInTheDocument()
    expect(paginationPageLink(2)).toHaveAttribute('aria-current', 'page')
    expect(listViewport().scrollTop).toBe(400)
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: documentPageSize,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
  })

  it('starts a newly selected page at the top of the list', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await act(() => {
      listViewport().scrollTop = 400
    })

    await user.click(paginationPageLink(2))
    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })

    expect(listViewport().scrollTop).toBe(0)
  })

  it('starts again from the first page after a new document is created', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    const { router } = renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(paginationPageLink(2))
    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })

    await user.click(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'سند 1' })

    await act(async () => {
      router.history.back()
    })

    await within(screen.getByRole('main')).findByRole('link', {
      name: 'سند 1',
    })
    expect(paginationPageLink(1)).toHaveAttribute('aria-current', 'page')
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
  })

  it('returns to the first page with cleared filters after a new document is created', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(
      screen.getByRole('combobox', { name: 'ترتیب بر اساس تاریخ ایجاد' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'قدیم به جدید' }),
    )
    await screen.findByRole('link', { name: 'سند 20' })

    await user.type(searchInput(), 'سند')
    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'سند', order: 'oldest' }),
        expect.any(String),
      ),
    )

    saveHomeScrollPosition({ page: 1, scrollTop: 400 })

    await user.click(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'سند 1' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    await screen.findByRole('link', { name: 'سند 1' })
    expect(searchInput()).toHaveValue('')
    expect(
      screen.getByRole('combobox', { name: 'ترتیب بر اساس تاریخ ایجاد' }),
    ).toHaveTextContent('جدید به قدیم')
    expect(paginationPageLink(1)).toHaveAttribute('aria-current', 'page')
    expect(listViewport().scrollTop).toBe(0)
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: 0,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )
  })

  it('invalidates every cached list page after a document is deleted', async () => {
    const documents = Array.from(
      { length: documentPageSize * 2 + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(paginationPageLink(3))
    await screen.findByRole('link', {
      name: `سند ${documentPageSize * 2 + 1}`,
    })
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: documentPageSize * 2,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )

    await user.click(paginationPageLink(2))
    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })

    const row = screen
      .getByRole('link', { name: `سند ${documentPageSize + 1}` })
      .closest('tr')
    expect(row).not.toBeNull()
    await user.click(
      within(row as HTMLElement).getByRole('button', { name: 'گزینه ها' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'بله',
      }),
    )

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    await screen.findByRole('link', { name: `سند ${documentPageSize + 2}` })
    expect(
      screen.queryByRole('link', { name: `سند ${documentPageSize + 1}` }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: `سند ${documentPageSize * 2 + 1}` }),
    ).toBeInTheDocument()

    await user.click(paginationPageLink(3))

    await screen.findByRole('link', {
      name: `سند ${documentPageSize * 2 + 2}`,
    })
    expect(
      screen.queryByRole('link', { name: `سند ${documentPageSize * 2 + 1}` }),
    ).not.toBeInTheDocument()
    const thirdPageCalls = vi
      .mocked(list)
      .mock.calls.filter(([options]) => options.offset === documentPageSize * 2)
    expect(thirdPageCalls).toHaveLength(2)
  })

  it('re-reads a filtered page cached before a delete from another page', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    const input = searchInput()
    await user.type(input, 'سند 5')
    await screen.findByRole('link', {
      name: `سند ${documentPageSize + 9}`,
    })
    expect(
      screen.getByRole('link', { name: `سند ${documentPageSize}` }),
    ).toBeInTheDocument()

    await user.clear(input)
    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(paginationPageLink(2))
    await screen.findByRole('link', { name: `سند ${documentPageSize + 1}` })

    const row = screen
      .getByRole('link', { name: `سند ${documentPageSize + 5}` })
      .closest('tr')
    expect(row).not.toBeNull()
    await user.click(
      within(row as HTMLElement).getByRole('button', { name: 'گزینه ها' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'بله',
      }),
    )
    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()

    await user.type(searchInput(), 'سند 5')
    await screen.findByRole('link', { name: 'سند 5' })
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('link', { name: `سند ${documentPageSize + 5}` }),
      ).not.toBeInTheDocument(),
    )
  })

  it('invalidates every page when the deleted document page is unknown', async () => {
    const documents = Array.from(
      { length: documentPageSize * 2 + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    const { router } = renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(screen.getByRole('link', { name: 'سند 1' }))
    await screen.findByRole('heading', { name: 'سند 1' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    await within(screen.getByRole('main')).findByRole('link', {
      name: 'سند 1',
    })

    await user.click(paginationPageLink(3))
    await screen.findByRole('link', {
      name: `سند ${documentPageSize * 2 + 1}`,
    })
    expect(list).toHaveBeenLastCalledWith(
      {
        offset: documentPageSize * 2,
        limit: documentPageSize,
        order: 'newest',
      },
      expect.any(String),
    )

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'سند 1' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'بله',
      }),
    )

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    await within(screen.getByRole('main')).findByRole('link', {
      name: `سند ${documentPageSize * 2 + 2}`,
    })

    await user.click(paginationPageLink(1))

    await within(screen.getByRole('main')).findByRole('link', {
      name: 'سند 2',
    })
    expect(
      screen.queryByRole('link', { name: 'سند 1' }),
    ).not.toBeInTheDocument()
    const firstPageCalls = vi
      .mocked(list)
      .mock.calls.filter(([options]) => options.offset === 0)
    expect(firstPageCalls).toHaveLength(2)
  })

  it('invalidates every page after a batch delete that spans pages', async () => {
    const documents = Array.from(
      { length: documentPageSize + 10 },
      (_, index) => ({
        ...storedDocument,
        id: index + 1,
        title: `سند ${index + 1}`,
      }),
    )
    const { list } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 1' })
    await user.click(
      screen.getByRole('button', {
        name: 'انتخاب گروهی اسناد',
      }),
    )
    await user.click(screen.getByRole('checkbox', { name: 'انتخاب سند سند 1' }))

    await user.click(paginationPageLink(2))
    const pageTwoFirstTitle = `انتخاب سند سند ${documentPageSize + 1}`
    await screen.findByRole('checkbox', {
      name: pageTwoFirstTitle,
    })
    await user.click(screen.getByRole('checkbox', { name: pageTwoFirstTitle }))
    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۲)' }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'بله',
      }),
    )

    expect(await screen.findByText('۲ سند حذف شد.')).toBeInTheDocument()
    await screen.findByRole('checkbox', {
      name: `انتخاب سند سند ${documentPageSize + 9}`,
    })

    await user.click(paginationPageLink(1))

    await screen.findByRole('checkbox', { name: 'انتخاب سند سند 2' })
    expect(
      screen.queryByRole('checkbox', { name: 'انتخاب سند سند 1' }),
    ).not.toBeInTheDocument()
    const firstPageCalls = vi
      .mocked(list)
      .mock.calls.filter(([options]) => options.offset === 0)
    expect(firstPageCalls).toHaveLength(2)
  })

  it('deletes a row through its options menu without leaving the home page', async () => {
    const document = { ...storedDocument, title: 'یادداشت' }
    const { remove } = installDocumentsBridge([document])
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        'آیا مطمئن هستید که می خواهید سند «یادداشت» را حذف کنید؟',
      ),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()

    await vi.waitFor(() =>
      expect(screen.queryByRole('table')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith(1)
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
  })

  it('drops a document deleted from its row menu out of the selected set', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'یادداشت' },
      { ...storedDocument, id: 2, title: 'گزارش' },
    ]
    const { removeMany } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(screen.getByRole('button', { name: 'انتخاب گروهی اسناد' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )
    await user.click(screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }))

    const row = screen.getByRole('button', { name: 'یادداشت' }).closest('tr')
    expect(row).not.toBeNull()
    await user.click(
      within(row as HTMLElement).getByRole('button', { name: 'گزینه ها' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'بله',
      }),
    )

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', {
        name: 'حذف اسناد انتخاب شده (۱)',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }),
    ).toBeChecked()
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'یادداشت' }),
      ).not.toBeInTheDocument(),
    )
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'بله',
      }),
    )

    expect(removeMany).toHaveBeenCalledExactlyOnceWith([2])
    expect(await screen.findByText('۱ سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
  })

  it('clears the selected documents when the title search changes', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'یادداشت' },
      {
        ...storedDocument,
        id: 2,
        title: 'گزارش',
        createdAt: 2_000,
        updatedAt: 2_000,
      },
    ]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'گزارش' })

    await user.click(screen.getByRole('button', { name: 'انتخاب گروهی اسناد' }))
    await user.click(screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }))
    expect(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    ).toBeInTheDocument()

    await user.type(searchInput(), 'گزارش')

    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }),
    ).not.toBeChecked()
  })

  it('clears the selected documents when the order changes', async () => {
    const documents = [
      {
        ...storedDocument,
        id: 1,
        title: 'یادداشت',
        createdAt: 1_000,
        updatedAt: 1_000,
      },
      {
        ...storedDocument,
        id: 2,
        title: 'گزارش',
        createdAt: 2_000,
        updatedAt: 2_000,
      },
    ]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'گزارش' })

    await user.click(screen.getByRole('button', { name: 'انتخاب گروهی اسناد' }))
    await user.click(screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }))
    expect(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('combobox', { name: 'ترتیب بر اساس تاریخ ایجاد' }),
    )
    await user.click(
      await screen.findByRole('option', { name: 'قدیم به جدید' }),
    )

    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }),
    ).not.toBeChecked()
  })

  it('keeps the row checkboxes hidden until the selection toggle is pressed', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'یادداشت' },
      { ...storedDocument, id: 2, title: 'گزارش' },
    ]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    const toggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    expect(toggle).toHaveAttribute('data-size', 'icon')
    expect(toggle).toHaveAttribute('data-variant', 'outline')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.querySelector('svg')).toHaveClass('lucide-list-checks')
    expect(toggle).not.toHaveClass('bg-primary')
    expect(toggle).not.toHaveClass('text-primary-foreground')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()

    await user.hover(toggle)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'انتخاب گروهی اسناد',
    )

    await user.click(toggle)

    expect(toggle).toHaveAttribute('data-variant', 'default')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveClass('bg-primary', 'text-primary-foreground')
    expect(toggle).not.toHaveClass('text-sidebar-primary')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).not.toBeChecked()
  })

  it('adds a checkbox column before the title while selecting and clears the selection when toggled off', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'یادداشت' },
      { ...storedDocument, id: 2, title: 'گزارش' },
    ]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    const toggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    const columnHeadTexts = () =>
      screen.getAllByRole('columnheader').map((head) => head.textContent)
    const columnWidths = () => {
      const [headerTable, bodyTable] = screen.getAllByRole('table')
      const headerCols = Array.from(headerTable?.querySelectorAll('col') ?? [])
      const bodyCols = Array.from(bodyTable?.querySelectorAll('col') ?? [])
      expect(bodyCols.map((col) => col.className)).toEqual(
        headerCols.map((col) => col.className),
      )
      return headerCols.map((col) => col.className)
    }

    expect(columnHeadTexts()).toEqual(['عنوان', 'تاریخ ایجاد', ''])
    expect(columnWidths()).toEqual(['w-[60%]', 'w-[20%]', 'w-[20%]'])

    await user.click(toggle)

    expect(toggle.parentElement).toHaveClass('pt-2', 'pb-1')
    expect(columnHeadTexts()).toEqual(['', 'عنوان', 'تاریخ ایجاد', ''])
    expect(columnWidths()).toEqual(['w-6', 'w-[60%]', 'w-[20%]', 'w-[20%]'])

    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).toBeChecked()
    expect(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    ).toBeInTheDocument()

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()
    expect(columnHeadTexts()).toEqual(['عنوان', 'تاریخ ایجاد', ''])
    expect(columnWidths()).toEqual(['w-[60%]', 'w-[20%]', 'w-[20%]'])

    await user.click(toggle)

    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).not.toBeChecked()
  })

  it('turns row titles into checkbox toggles instead of links while selecting', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'یادداشت' },
      { ...storedDocument, id: 2, title: 'گزارش' },
    ]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    const { router } = renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(
      screen.getByRole('button', {
        name: 'انتخاب گروهی اسناد',
      }),
    )

    expect(
      screen.queryByRole('link', { name: 'یادداشت' }),
    ).not.toBeInTheDocument()
    const title = screen.getByRole('button', { name: 'یادداشت' })
    expect(title).toHaveAttribute('aria-pressed', 'false')

    await user.click(title)

    expect(title).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).toBeChecked()
    expect(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')

    await user.click(title)

    expect(title).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).not.toBeChecked()
    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows the destructive batch button beside the toggle and asks with the selected count', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'یادداشت' },
      { ...storedDocument, id: 2, title: 'گزارش' },
      { ...storedDocument, id: 3, title: 'پیش نویس' },
    ]
    const { removeMany } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    const toggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    await user.click(toggle)
    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )

    expect(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }))

    const deleteButton = screen.getByRole('button', {
      name: 'حذف اسناد انتخاب شده (۲)',
    })
    expect(deleteButton).toHaveAttribute('data-variant', 'destructive')
    expect(deleteButton.parentElement).toBe(toggle.parentElement)
    expect(deleteButton.querySelector('svg')).toHaveClass('lucide-trash')

    await user.click(deleteButton)

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        'آیا مطمئن هستید که می خواهید ۲ سند انتخاب شده را حذف کنید؟',
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText('این عملیات غیر قابل بازگشت است.'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'بله' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'انصراف' }),
    ).toBeInTheDocument()
    expect(removeMany).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }))

    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۲)' }),
    ).toBeInTheDocument()
    expect(removeMany).not.toHaveBeenCalled()
  })

  it('deletes every selected document in one call and re-reads the list and the count', async () => {
    const documents = [
      { ...storedDocument, id: 1, title: 'یادداشت' },
      { ...storedDocument, id: 2, title: 'گزارش' },
      { ...storedDocument, id: 3, title: 'پیش نویس' },
      { ...storedDocument, id: 4, title: 'طرح' },
    ]
    const { list, removeMany } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    const { queryClient } = renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })
    await act(() => {
      queryClient.setQueryData(documentQuery(1).queryKey, documents[0])
      queryClient.setQueryData(documentQuery(3).queryKey, documents[2])
      queryClient.setQueryData(documentQuery(4).queryKey, documents[3])
    })

    await user.click(
      screen.getByRole('button', {
        name: 'انتخاب گروهی اسناد',
      }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند پیش نویس' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۲)' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(removeMany).toHaveBeenCalledExactlyOnceWith([1, 3])
    expect(await screen.findByText('۲ سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۲)' }),
    ).toBeInTheDocument()

    await vi.waitFor(() =>
      expect(
        screen.queryByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند گزارش' }),
    ).not.toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند طرح' }),
    ).not.toBeChecked()
    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toBeUndefined()
    expect(queryClient.getQueryData(documentQuery(3).queryKey)).toBeUndefined()
    expect(queryClient.getQueryData(documentQuery(4).queryKey)).toEqual(
      documents[3],
    )
  })

  it('holds the batch dialog open with both buttons disabled while the delete runs', async () => {
    const documents = [{ ...storedDocument, id: 1, title: 'یادداشت' }]
    let finishDelete!: () => void
    const removeMany = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDelete = resolve
        }),
    )
    installDocumentsBridge(documents, { removeMany })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(
      screen.getByRole('button', {
        name: 'انتخاب گروهی اسناد',
      }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(removeMany).toHaveBeenCalledExactlyOnceWith([1])
    const confirm = screen.getByRole('button', { name: 'در حال حذف...' })
    expect(confirm).toBeDisabled()
    expect(confirm.querySelector('svg')).toHaveClass('size-4', 'animate-spin')
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeDisabled()

    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(() => finishDelete())
    expect(await screen.findByText('۱ سند حذف شد.')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).not.toBeChecked()
    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()
  })

  it('reports a failed batch delete with an error toast and keeps the dialog open for another try', async () => {
    const documents = [{ ...storedDocument, id: 1, title: 'یادداشت' }]
    let attempts = 0
    const removeMany = vi.fn((): Promise<void> => {
      attempts += 1
      return attempts === 1
        ? Promise.reject(
            new Error(
              'The deleteDocuments operation failed (injected by --with-db-failure)',
            ),
          )
        : Promise.resolve()
    })
    installDocumentsBridge(documents, { removeMany })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(
      screen.getByRole('button', {
        name: 'انتخاب گروهی اسناد',
      }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    )
    await user.click(await screen.findByRole('button', { name: 'بله' }))

    expect(
      await screen.findByText('حذف اسناد ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The deleteDocuments operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'انصراف' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'بله' })).toBeEnabled()
    expect(screen.queryByText('۱ سند حذف شد.')).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', {
        name: 'انتخاب سند یادداشت',
        hidden: true,
      }),
    ).toBeChecked()

    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(await screen.findByText('۱ سند حذف شد.')).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).not.toBeChecked()
    expect(removeMany).toHaveBeenCalledTimes(2)
    expect(removeMany).toHaveBeenLastCalledWith([1])
  })

  it('reports a batch delete that cannot reach the bridge instead of closing silently', async () => {
    const documents = [{ ...storedDocument, id: 1, title: 'یادداشت' }]
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })

    await user.click(screen.getByRole('button', { name: 'انتخاب گروهی اسناد' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    )
    const dialog = await screen.findByRole('alertdialog')

    Reflect.deleteProperty(window, 'WordApp')
    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(
      await screen.findByText('حذف اسناد ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', {
        name: 'انتخاب سند یادداشت',
        hidden: true,
      }),
    ).toBeChecked()
  })

  it('re-reads the documents list once the created document is stored', async () => {
    const stored: Array<TestDocument> = []
    const list = vi.fn(async (options: DocumentListOptions) =>
      documentListPage(stored, options),
    )
    const count = vi.fn(async () => stored.length)
    const create = vi.fn(async () => {
      const created = { ...storedDocument }
      stored.push(created)
      return created
    })
    installBridge({ create, count, list })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })
    expect(
      await screen.findByText('هنوز سندی ثبت نشده است.'),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    await screen.findByRole('heading', { name: 'مستندات (۱)' })
    expect(
      await within(screen.getByRole('main')).findByRole('link', {
        name: 'بدون عنوان',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('هنوز سندی ثبت نشده است.'),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('re-reads the documents list after a title save so the table shows the new title', async () => {
    const stored: TestDocument[] = [{ ...storedDocument }]
    const list = vi.fn(async (options: DocumentListOptions) =>
      documentListPage(stored, options),
    )
    const get = vi.fn(async (id: number) => stored.find((row) => row.id === id))
    const save = vi.fn(async (id: number, changes: DocumentChanges) => {
      const index = stored.findIndex((row) => row.id === id)
      if (index < 0) {
        return undefined
      }
      stored[index] = {
        ...stored[index],
        ...changes,
        updatedAt: stored[index].updatedAt + 1,
      }
      return stored[index]
    })
    installBridge({ get, save, list })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بدون عنوان' }))
    const heading = await screen.findByRole('heading', { name: 'بدون عنوان' })
    await user.click(heading)
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش تازه')
    await user.tab()

    await screen.findByRole('heading', { name: 'گزارش تازه' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    const bodyTable = (await screen.findAllByRole('table'))[1]
    expect(
      await within(bodyTable).findByRole('link', { name: 'گزارش تازه' }),
    ).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('re-reads the filtered count after a title save changes the match', async () => {
    const stored: TestDocument[] = [{ ...storedDocument, title: 'گزارش' }]
    const list = vi.fn(async (options: DocumentListOptions) =>
      documentListPage(stored, options),
    )
    const count = vi.fn(async (search?: string) => {
      const term = search?.trim().toLowerCase() ?? ''
      return term === ''
        ? stored.length
        : stored.filter(
            (row) => row.title?.toLowerCase().includes(term) ?? false,
          ).length
    })
    const get = vi.fn(async (id: number) => stored.find((row) => row.id === id))
    const save = vi.fn(async (id: number, changes: DocumentChanges) => {
      const index = stored.findIndex((row) => row.id === id)
      if (index < 0) {
        return undefined
      }
      stored[index] = {
        ...stored[index],
        ...changes,
        updatedAt: stored[index].updatedAt + 1,
      }
      return stored[index]
    })
    installBridge({ get, save, list, count })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'گزارش' })
    await user.type(searchInput(), 'گزارش')

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'گزارش' }))
    const heading = await screen.findByRole('heading', { name: 'گزارش' })
    await user.click(heading)
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'یادداشت')
    await user.tab()

    await screen.findByRole('heading', { name: 'یادداشت' })
    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByText('سندی با این عنوان پیدا نشد.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(count).toHaveBeenLastCalledWith('گزارش', expect.any(String))
  })

  it('re-reads the filtered count after deleting the matching document from its page', async () => {
    const stored = [
      { ...storedDocument, id: 1, title: 'گزارش' },
      { ...storedDocument, id: 2, title: 'یادداشت' },
    ]
    const list = vi.fn(async (options: DocumentListOptions) =>
      documentListPage(stored, options),
    )
    const count = vi.fn(async (search?: string) => {
      const term = search?.trim().toLowerCase() ?? ''
      return term === ''
        ? stored.length
        : stored.filter(
            (row) => row.title?.toLowerCase().includes(term) ?? false,
          ).length
    })
    const get = vi.fn(async (id: number) => stored.find((row) => row.id === id))
    const remove = vi.fn(async (id: number) => {
      const index = stored.findIndex((row) => row.id === id)
      if (index >= 0) {
        stored.splice(index, 1)
      }
    })
    installBridge({ get, remove, list, count })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('link', { name: 'یادداشت' })
    await user.type(searchInput(), 'گزارش')

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(await screen.findByRole('button', { name: 'بله' }))

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'جستجوی عنوان' })).toHaveValue(
      'گزارش',
    )
    expect(
      await screen.findByText('سندی با این عنوان پیدا نشد.'),
    ).toBeInTheDocument()
    expect(count).toHaveBeenLastCalledWith('گزارش', expect.any(String))
  })
})
