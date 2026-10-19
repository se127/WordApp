import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  clearHomeScrollOffset,
  readHomeMeasurements,
  saveHomeMeasurements,
  saveHomeScrollOffset,
} from '@/lib/home-scroll'
import {
  createQueryClient,
  documentPageSize,
  documentsCountQuery,
  documentsQuery,
  documentQuery,
} from '@/lib/query'
import { createAppRouter } from '@/router'
import type {
  DocumentChanges,
  DocumentListCursor,
  DocumentListOptions,
  DocumentListPage,
} from '@/types/global'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function documentListPage(
  documents: Array<typeof storedDocument>,
  { cursor, limit }: DocumentListOptions,
): DocumentListPage {
  const start =
    cursor === null
      ? 0
      : documents.findIndex(
          (document) =>
            document.createdAt === cursor.createdAt &&
            document.id === cursor.id,
        ) + 1
  const page = documents.slice(start, start + limit)
  const lastDocument = page.at(-1)

  return {
    documents: page,
    nextCursor:
      documents.length > start + limit && lastDocument
        ? { createdAt: lastDocument.createdAt, id: lastDocument.id }
        : null,
  }
}

function infiniteDocumentPages(documents: Array<typeof storedDocument>) {
  const pages: DocumentListPage[] = []
  const pageParams: Array<DocumentListCursor | null> = []
  let cursor: DocumentListCursor | null = null

  for (let start = 0; start < documents.length; start += documentPageSize) {
    const pageDocuments = documents.slice(start, start + documentPageSize)
    const lastDocument = pageDocuments.at(-1)

    pageParams.push(cursor)
    cursor =
      start + documentPageSize < documents.length && lastDocument
        ? { createdAt: lastDocument.createdAt, id: lastDocument.id }
        : null
    pages.push({ documents: pageDocuments, nextCursor: cursor })
  }

  return { pages, pageParams }
}

function installBridge(
  options: {
    create?: () => Promise<typeof storedDocument>
    get?: (id: number) => Promise<typeof storedDocument | undefined>
    count?: () => Promise<number>
    list?: (options: DocumentListOptions) => Promise<DocumentListPage>
    save?: (
      id: number,
      changes: DocumentChanges,
    ) => Promise<typeof storedDocument | undefined>
    remove?: (id: number) => Promise<void>
    removeMany?: (ids: number[]) => Promise<void>
  } = {},
) {
  let storedCount = 0
  let storedRow = storedDocument
  const create =
    options.create ??
    vi.fn(async () => {
      storedCount += 1
      return storedDocument
    })
  const get = options.get ?? vi.fn(async () => storedRow)
  const count = options.count ?? vi.fn(async () => storedCount)
  const list =
    options.list ??
    vi.fn(async () => ({ documents: [], nextCursor: null }) as DocumentListPage)
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

  window.WordApp = {
    platform: 'win32',
    documents: {
      create,
      get,
      count,
      list,
      save,
      delete: remove,
      deleteMany: removeMany,
    },
    windowControls: {
      minimize: vi.fn(async () => {}),
      toggleMaximize: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn(() => () => {}),
    },
  } satisfies WordAppBridge

  return { create, get, count, list, save, remove, removeMany }
}

function installDocumentsBridge(
  documents: Array<typeof storedDocument>,
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
    count: vi.fn(async () => stored.length),
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

function measuredRowItems(count: number) {
  let start = 0

  return Array.from({ length: count }, (_, index) => {
    const size = index % 3 === 0 ? 64 : 37
    const item = {
      key: index + 1,
      index,
      start,
      size,
      end: start + size,
      lane: 0,
    }
    start += size
    return item
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

async function scrollListTo(scrollTop: number): Promise<void> {
  await act(() => {
    const viewport = listViewport()
    viewport.scrollTop = scrollTop
    viewport.dispatchEvent(new Event('scroll'))
  })
}

function renderRoute(
  initialEntry: string,
  {
    seedDocuments,
    seedHomeScroll,
  }: {
    seedDocuments?: Array<typeof storedDocument>
    seedHomeScroll?: {
      offset: number
      measurements: ReturnType<typeof measuredRowItems>
    }
  } = {},
) {
  clearHomeScrollOffset()
  if (seedHomeScroll) {
    saveHomeScrollOffset(seedHomeScroll.offset)
    saveHomeMeasurements(seedHomeScroll.measurements)
  }
  const queryClient = createQueryClient()
  if (seedDocuments) {
    queryClient.setQueryData(
      documentsQuery.queryKey,
      infiniteDocumentPages(seedDocuments),
    )
  }
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [initialEntry] }),
    queryClient,
  )

  render(
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </TooltipProvider>
    </DirectionProvider>,
  )

  return { router, queryClient }
}

afterEach(() => {
  clearHomeScrollOffset()
  toast.dismiss()
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
    expect(heading).toHaveClass('flex', 'h-8', 'items-center')
    expect(
      within(screen.getByRole('main')).getByRole('button', {
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
    expect(within(heading).getByRole('status')).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('button', {
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
      within(screen.getByRole('main')).getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))

    const staleCount = await screen.findByText('(۰)')
    expect(staleCount).toHaveClass('animate-pulse')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(() => finishRefetch(1))

    expect(await screen.findByText('(۱)')).not.toHaveClass('animate-pulse')
  })

  it('shows a destructive retry button when the count read fails and recovers the count when pressed', async () => {
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

    const retry = await screen.findByRole('button', {
      name: 'تلاش دوباره برای دریافت تعداد سندها',
    })
    expect(retry).toHaveClass('text-destructive', 'hover:text-destructive')
    expect(retry).not.toHaveClass('hover:text-foreground')

    await user.click(retry)

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۲)' }),
    ).toBeInTheDocument()
    expect(count).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByRole('button', {
        name: 'تلاش دوباره برای دریافت تعداد سندها',
      }),
    ).not.toBeInTheDocument()
  })

  it('explains the retry button with a tooltip', async () => {
    const count = vi.fn(async (): Promise<number> => {
      throw new Error('count read failed')
    })
    installBridge({ count })
    const user = userEvent.setup()

    renderRoute('/')

    await user.hover(
      await screen.findByRole('button', {
        name: 'تلاش دوباره برای دریافت تعداد سندها',
      }),
    )

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'تلاش دوباره برای دریافت تعداد سندها',
    )
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
        name: 'تلاش دوباره برای دریافت تعداد سندها',
      }),
    )

    const heading = screen.getByRole('heading')
    expect(await within(heading).findByRole('status')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'تلاش دوباره برای دریافت تعداد سندها',
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
      name: 'تلاش دوباره برای دریافت تعداد سندها',
    })

    await user.click(retry)
    const busy = screen.getByRole('button', {
      name: 'تلاش دوباره برای دریافت تعداد سندها',
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
        name: 'تلاش دوباره برای دریافت تعداد سندها',
      }),
    ).not.toBeInTheDocument()
  })

  it('shows the pending spinner while the document row is loading, then the title with its options menu', async () => {
    let finishGet!: (document: typeof storedDocument) => void
    const get = vi.fn(
      () =>
        new Promise<typeof storedDocument>((resolve) => {
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

  it('reports a failed document read with an error and a retry button, and recovers the document when pressed', async () => {
    let attempts = 0
    const get = vi.fn((): Promise<typeof storedDocument> => {
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

    const message = await screen.findByText(
      'بارگذاری سند ناموفق بود. دوباره تلاش کنید.',
    )
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
    expect(retry).not.toHaveClass('text-destructive')
    expect(retry).not.toHaveClass('hover:text-destructive')
    expect(retry.querySelector('svg')).toHaveClass('text-destructive')

    await user.click(retry)

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سند ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('shows the content-box spinner while a retry from a failed document read is in flight', async () => {
    let reads = 0
    let finishRetry!: (document: typeof storedDocument) => void
    const get = vi.fn((): Promise<typeof storedDocument> => {
      reads += 1
      if (reads === 1) {
        return Promise.reject(new Error('document read failed'))
      }
      return new Promise<typeof storedDocument>((resolve) => {
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
      screen.queryByText('بارگذاری سند ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()

    await vi.waitFor(() => expect(finishRetry).toBeTypeOf('function'))
    await act(() => finishRetry(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the document retry as a labeled button without a tooltip', async () => {
    const get = vi.fn(async (): Promise<typeof storedDocument> => {
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
      'dark:hover:bg-zinc-700',
      'dark:focus:bg-zinc-700',
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
    expect(screen.getByRole('link', { name: 'بدون عنوان' })).toBeInTheDocument()

    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()

    expect(screen.getByRole('button', { name: 'تمام صفحه' })).toHaveFocus()

    await user.tab()
    await user.tab()

    expect(heading).toHaveFocus()
    expect(heading).toHaveClass('focus:border-input')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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

  it('hands focus back to the heading when Enter commits the edit', async () => {
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
    await user.keyboard('{Enter}')

    const saved = await screen.findByRole('heading', { name: 'گزارش' })
    expect(save).toHaveBeenCalledExactlyOnceWith(1, { title: 'گزارش' })
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

  it('saves the changed title on blur through the document save action and re-reads the row', async () => {
    const { get, save } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })

    await user.clear(input)
    await user.type(input, 'گزارش سالانه')

    expect(save).not.toHaveBeenCalled()

    await user.tab()

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش سالانه',
    })
    expect(
      await screen.findByRole('heading', { name: 'گزارش سالانه' }),
    ).toBeInTheDocument()

    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2))
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

  it('holds the title input disabled with a spinner while the save is in flight', async () => {
    let storedRow = storedDocument
    const get = vi.fn(async () => storedRow)
    let finishSave!: (document: typeof storedDocument) => void
    const save = vi.fn(
      () =>
        new Promise<typeof storedDocument>((resolve) => {
          finishSave = resolve
        }),
    )
    installBridge({ get, save })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    expect(input).not.toHaveClass('pe-8')
    await user.clear(input)
    await user.type(input, 'پیگیری')
    await user.tab()

    const pending = screen.getByRole('textbox', { name: 'عنوان سند' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveValue('پیگیری')
    expect(pending).toHaveClass('pe-8')
    expect(pending.parentElement?.querySelector('svg')).toHaveClass(
      'size-4',
      'animate-spin',
    )
    expect(
      screen.getByRole('status', { name: 'در حال ذخیره ی سند' }),
    ).toBeInTheDocument()

    storedRow = {
      ...storedRow,
      title: 'پیگیری',
      updatedAt: storedRow.updatedAt + 1,
    }
    await act(() => finishSave(storedRow))

    expect(
      await screen.findByRole('heading', { name: 'پیگیری' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps the saved title and the updating loader on screen while the row re-reads', async () => {
    let reads = 0
    let finishReread!: (document: typeof storedDocument) => void
    const get = vi.fn((): Promise<typeof storedDocument> => {
      reads += 1
      if (reads === 1) {
        return Promise.resolve(storedDocument)
      }
      return new Promise<typeof storedDocument>((resolve) => {
        finishReread = resolve
      })
    })
    installBridge({ get })
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'بدون عنوان' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش')
    await user.tab()

    expect(
      await screen.findByRole('heading', { name: 'گزارش' }),
    ).toBeInTheDocument()

    const updating = await screen.findByRole('status', {
      name: 'در حال به روز رسانی سند',
    })
    expect(updating).toHaveClass('ms-auto')
    expect(updating).toHaveTextContent('در حال به روز رسانی سند...')
    expect(updating.querySelector('svg')).toHaveClass('size-4', 'animate-spin')

    await vi.waitFor(() => expect(finishReread).toBeTypeOf('function'))
    await act(() =>
      finishReread({ ...storedDocument, title: 'گزارش', updatedAt: 1_001 }),
    )

    expect(
      await screen.findByRole('heading', { name: 'گزارش' }),
    ).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    )
  })

  it('reports a failed save with an error toast and keeps the edited text for another try', async () => {
    let attempts = 0
    let storedRow = storedDocument
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

    const kept = screen.getByRole('textbox', { name: 'عنوان سند' })
    expect(kept).toHaveValue('پیش نویس')
    expect(kept).not.toBeDisabled()
    await vi.waitFor(() => expect(kept).toHaveFocus())

    await user.tab()

    expect(
      await screen.findByRole('heading', { name: 'پیش نویس' }),
    ).toBeInTheDocument()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('creates an untitled document and opens its page', async () => {
    const { create, get } = installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(
      await within(screen.getByRole('main')).findByRole('button', {
        name: 'افزودن سند',
      }),
    )

    expect(create).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(1)
  })

  it('creates a document from the title bar add button and opens its page', async () => {
    const { create, get } = installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    const titleBar = screen.getByText('WordApp').closest('div[dir="ltr"]')
    await user.click(
      within(titleBar as HTMLElement).getByRole('button', {
        name: 'افزودن سند',
      }),
    )

    expect(create).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(1)
  })

  it('disables both create buttons and shows a spinner while the document is being created', async () => {
    let finishCreate!: (document: typeof storedDocument) => void
    const create = vi.fn(
      () =>
        new Promise<typeof storedDocument>((resolve) => {
          finishCreate = resolve
        }),
    )
    installBridge({ create })
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(
      await within(screen.getByRole('main')).findByRole('button', {
        name: 'افزودن سند',
      }),
    )

    const button = within(screen.getByRole('main')).getByRole('button', {
      name: 'در حال ساخت سند...',
    })
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('size-4', 'animate-spin')

    const titleBar = screen.getByText('WordApp').closest('div[dir="ltr"]')
    expect(
      within(titleBar as HTMLElement).getByRole('button', {
        name: 'در حال ساخت سند...',
      }),
    ).toBeDisabled()

    await act(() => finishCreate(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
  })

  it('keeps the home create button busy while the title bar creates a document', async () => {
    let finishCreate!: (document: typeof storedDocument) => void
    const create = vi.fn(
      () =>
        new Promise<typeof storedDocument>((resolve) => {
          finishCreate = resolve
        }),
    )
    installBridge({ create })
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    const titleBar = screen.getByText('WordApp').closest('div[dir="ltr"]')
    await user.click(
      within(titleBar as HTMLElement).getByRole('button', {
        name: 'افزودن سند',
      }),
    )

    const button = within(screen.getByRole('main')).getByRole('button', {
      name: 'در حال ساخت سند...',
    })
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('size-4', 'animate-spin')

    await act(() => finishCreate(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
  })

  it('returns to the home page through the title bar home link', async () => {
    installDocumentsBridge([storedDocument])
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
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
        'آیا مطمئن هستید که می خواهید این سند را حذف کنید؟',
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

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })
    expect(get).toHaveBeenCalledTimes(2)
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

    await user.click(screen.getByRole('link', { name: 'خانه' }))

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
      within(screen.getByRole('main')).getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
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
      await within(screen.getByRole('main')).findByRole('button', {
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
      within(screen.getByRole('main')).getByRole('button', {
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
      await within(screen.getByRole('main')).findByRole('button', {
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

    await user.click(screen.getByRole('link', { name: 'خانه' }))
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

    expect(screen.getByRole('cell', { name: '5 دقیقه ی پیش' })).toHaveClass(
      'text-center',
    )
    expect(screen.getByRole('cell', { name: '1 روز پیش' })).toHaveClass(
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

  it('shows a centered message while no documents are stored', async () => {
    installBridge()

    renderRoute('/')

    const message = await screen.findByText('هنوز سندی ثبت نشده است.')
    expect(message.parentElement).toHaveClass('items-center', 'justify-center')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
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

    expect(screen.getByText('5 دقیقه ی پیش')).toBeInTheDocument()
    expect(screen.getByText('1 روز پیش')).toBeInTheDocument()
    expect(screen.getByText('همین الان')).toBeInTheDocument()

    await user.hover(screen.getByText('5 دقیقه ی پیش'))
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

    const editedLine = screen.getByText('ویرایش شده: 5 دقیقه ی پیش')
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
    let finishList!: (page: DocumentListPage) => void
    const list = vi.fn(
      (_options: DocumentListOptions) =>
        new Promise<DocumentListPage>((resolve) => {
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
      within(screen.getByRole('main')).getByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeEnabled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledExactlyOnceWith({
      cursor: null,
      limit: documentPageSize,
    })

    await act(() =>
      finishList({
        documents: [{ ...storedDocument, title: 'یادداشت' }],
        nextCursor: null,
      }),
    )

    expect(
      await screen.findByRole('link', { name: 'یادداشت' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the stale rows and pulses the table while the list re-reads', async () => {
    let reads = 0
    let finishReread!: (page: DocumentListPage) => void
    const list = vi.fn(
      (options: DocumentListOptions): Promise<DocumentListPage> => {
        reads += 1
        if (reads > 1) {
          return new Promise<DocumentListPage>((resolve) => {
            finishReread = resolve
          })
        }
        return Promise.resolve(documentListPage([storedDocument], options))
      },
    )
    installBridge({ list })

    const { queryClient } = renderRoute('/')
    await screen.findByRole('link', { name: 'بدون عنوان' })

    expect(
      screen.getByRole('link', { name: 'بدون عنوان' }).closest('table'),
    ).not.toHaveClass('animate-pulse')

    await act(async () => {
      void queryClient.invalidateQueries({
        queryKey: documentsQuery.queryKey,
      })
    })

    await vi.waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'بدون عنوان' }).closest('table'),
      ).toHaveClass('animate-pulse'),
    )
    expect(screen.getByRole('link', { name: 'بدون عنوان' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(() =>
      finishReread({
        documents: [{ ...storedDocument, title: 'عنوان تازه' }],
        nextCursor: null,
      }),
    )

    expect(
      await screen.findByRole('link', { name: 'عنوان تازه' }),
    ).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'عنوان تازه' }).closest('table'),
      ).not.toHaveClass('animate-pulse'),
    )
  })

  it('reports a failed list read with an error and a retry button, and recovers the table when pressed', async () => {
    let attempts = 0
    const list = vi.fn(
      (options: DocumentListOptions): Promise<DocumentListPage> => {
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

    const message = await screen.findByText(
      'بارگذاری سندها ناموفق بود. دوباره تلاش کنید.',
    )
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
      within(screen.getByRole('main')).getByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeEnabled()

    const retry = screen.getByRole('button', {
      name: 'تلاش دوباره',
    })
    expect(retry).not.toHaveClass('text-destructive')
    expect(retry).not.toHaveClass('hover:text-destructive')
    expect(retry.querySelector('svg')).toHaveClass('text-destructive')

    await user.click(retry)

    expect(
      await screen.findByRole('link', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('بارگذاری سندها ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('shows the centered loader while a retry from a failed list read is in flight', async () => {
    let attempts = 0
    let finishRetry!: (page: DocumentListPage) => void
    const list = vi.fn(
      (_options: DocumentListOptions): Promise<DocumentListPage> => {
        attempts += 1
        if (attempts === 1) {
          return Promise.reject(new Error('list read failed'))
        }
        return new Promise<DocumentListPage>((resolve) => {
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
      screen.queryByText('بارگذاری سندها ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()

    await act(() =>
      finishRetry({ documents: [storedDocument], nextCursor: null }),
    )

    expect(
      await screen.findByRole('link', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the retry button busy with a spinner while a stale list re-reads', async () => {
    let reads = 0
    let finishRetry!: (page: DocumentListPage) => void
    const list = vi.fn(
      (options: DocumentListOptions): Promise<DocumentListPage> => {
        reads += 1
        if (reads === 1) {
          return Promise.resolve(documentListPage([storedDocument], options))
        }
        if (reads === 2) {
          return Promise.reject(new Error('list re-read failed'))
        }
        return new Promise<DocumentListPage>((resolve) => {
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
        queryKey: documentsQuery.queryKey,
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

    await act(() =>
      finishRetry({ documents: [storedDocument], nextCursor: null }),
    )

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
      async (_options: DocumentListOptions): Promise<DocumentListPage> => {
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

  it('shows the first twenty-five documents and asks for nothing else when the list ends there', async () => {
    const documents = Array.from({ length: 25 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index + 1}`,
    }))
    const list = vi.fn(async (options: DocumentListOptions) =>
      documentListPage(documents, options),
    )
    installBridge({ list })

    renderRoute('/')

    await screen.findByRole('link', { name: 'سند 25' })
    expect(screen.getAllByRole('link', { name: /^سند / })).toHaveLength(25)
    expect(list).toHaveBeenCalledExactlyOnceWith({
      cursor: null,
      limit: documentPageSize,
    })
    expect(
      screen.queryByText('در حال بارگذاری بیشتر...'),
    ).not.toBeInTheDocument()
  })

  it('loads the next page when the end of the list is reached, with the loading footer while it runs', async () => {
    const documents = Array.from({ length: 75 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index + 1}`,
    }))
    let finishThirdPage: (() => void) | undefined
    const list = vi.fn(
      (options: DocumentListOptions): Promise<DocumentListPage> => {
        if (options.cursor !== null && options.cursor.id === documents[49].id) {
          return new Promise<DocumentListPage>((resolve) => {
            finishThirdPage = () =>
              resolve(documentListPage(documents, options))
          })
        }
        return Promise.resolve(documentListPage(documents, options))
      },
    )
    installBridge({ list })

    renderRoute('/')

    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))

    await scrollListTo(99999)

    expect(
      await screen.findByRole('link', { name: 'سند 50' }),
    ).toBeInTheDocument()
    const footer = await screen.findByRole('status')
    expect(footer).toHaveTextContent('در حال بارگذاری بیشتر...')
    expect(footer.querySelector('svg')).toHaveClass('size-4', 'animate-spin')
    expect(
      screen.getByRole('link', { name: 'سند 50' }).closest('table'),
    ).not.toHaveClass('animate-pulse')
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(3))
    expect(list).toHaveBeenLastCalledWith({
      cursor: { createdAt: documents[49].createdAt, id: documents[49].id },
      limit: documentPageSize,
    })

    await act(() => finishThirdPage?.())

    expect(
      await screen.findByRole('link', { name: 'سند 75' }),
    ).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(
        screen.queryByText('در حال بارگذاری بیشتر...'),
      ).not.toBeInTheDocument(),
    )
    expect(list).toHaveBeenCalledTimes(3)
  })

  it('loads each page once while the end of the list is hit back and forth repeatedly', async () => {
    const documents = Array.from({ length: 75 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index + 1}`,
    }))
    const pendingPages = new Map<number, () => void>()
    const list = vi.fn(
      (options: DocumentListOptions): Promise<DocumentListPage> => {
        const cursor = options.cursor
        if (cursor !== null) {
          return new Promise<DocumentListPage>((resolve) => {
            pendingPages.set(cursor.id, () =>
              resolve(documentListPage(documents, options)),
            )
          })
        }
        return Promise.resolve(documentListPage(documents, options))
      },
    )
    installBridge({ list })

    renderRoute('/')

    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect([...pendingPages.keys()]).toEqual([documents[24].id])

    for (let round = 0; round < 4; round += 1) {
      await scrollListTo(99999)
      await scrollListTo(0)
    }

    expect(list).toHaveBeenCalledTimes(2)

    await act(() => pendingPages.get(documents[24].id)?.())
    expect(list).toHaveBeenCalledTimes(2)

    await scrollListTo(99999)
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(3))
    expect([...pendingPages.keys()]).toEqual([
      documents[24].id,
      documents[49].id,
    ])

    for (let round = 0; round < 4; round += 1) {
      await scrollListTo(0)
      await scrollListTo(99999)
    }

    expect(list).toHaveBeenCalledTimes(3)

    await scrollListTo(0)
    const topTitles = screen
      .getAllByRole('link', { name: /^سند / })
      .map((link) => link.textContent)
    await scrollListTo(99999)
    const endTitles = screen
      .getAllByRole('link', { name: /^سند / })
      .map((link) => link.textContent)
    expect(new Set([...topTitles, ...endTitles]).size).toBe(
      topTitles.length + endTitles.length,
    )

    await act(() => pendingPages.get(documents[49].id)?.())

    expect(
      await screen.findByRole('link', { name: 'سند 75' }),
    ).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(3)

    await scrollListTo(0)
    await scrollListTo(99999)

    expect(list).toHaveBeenCalledTimes(3)
    expect(list.mock.calls.map(([options]) => options)).toEqual([
      { cursor: null, limit: documentPageSize },
      {
        cursor: { createdAt: documents[24].createdAt, id: documents[24].id },
        limit: documentPageSize,
      },
      {
        cursor: { createdAt: documents[49].createdAt, id: documents[49].id },
        limit: documentPageSize,
      },
    ])
  })

  it('keeps the loaded rows and retries from the footer when a later page fails', async () => {
    const documents = Array.from({ length: 30 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index + 1}`,
    }))
    let attempts = 0
    let finishRetry: (() => void) | undefined
    const list = vi.fn(
      (options: DocumentListOptions): Promise<DocumentListPage> => {
        if (options.cursor !== null) {
          attempts += 1
          if (attempts === 1) {
            return Promise.reject(
              new Error(
                'The listMoreDocuments operation failed (injected by --with-db-failure)',
              ),
            )
          }
          if (attempts === 2) {
            return new Promise<DocumentListPage>((resolve) => {
              finishRetry = () => resolve(documentListPage(documents, options))
            })
          }
        }
        return Promise.resolve(documentListPage(documents, options))
      },
    )
    installBridge({ list })
    const user = userEvent.setup()

    renderRoute('/')

    const message = await screen.findByText(
      'بارگذاری سندهای بیشتر ناموفق بود. دوباره تلاش کنید.',
    )
    expect(message.closest('div')).toHaveClass(
      'items-center',
      'justify-center',
      'flex-col',
    )
    expect(
      screen.queryByText(
        'The listMoreDocuments operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'سند 25' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'سند 26' }),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))

    const footer = await screen.findByRole('status')
    expect(footer).toHaveTextContent('در حال بارگذاری بیشتر...')
    expect(
      screen.queryByText('بارگذاری سندهای بیشتر ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(3)

    await act(() => finishRetry?.())

    await scrollListTo(99999)

    expect(
      await screen.findByRole('link', { name: 'سند 30' }),
    ).toBeInTheDocument()
    await vi.waitFor(() =>
      expect(
        screen.queryByText('در حال بارگذاری بیشتر...'),
      ).not.toBeInTheDocument(),
    )
    expect(list).toHaveBeenCalledTimes(3)
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
    expect(toggle.querySelector('svg')).not.toHaveClass('text-sidebar-primary')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()

    await user.hover(toggle)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'انتخاب گروهی اسناد',
    )

    await user.click(toggle)

    expect(toggle).toHaveAttribute('data-variant', 'outline')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle.querySelector('svg')).toHaveClass('text-sidebar-primary')
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

    await user.click(title)

    expect(
      screen.getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    ).toBeChecked()
    expect(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱)' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')

    await user.click(title)

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

  it('re-reads the documents list once the created document is stored', async () => {
    const stored: Array<typeof storedDocument> = []
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
      within(screen.getByRole('main')).getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))

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
    const stored = [{ ...storedDocument }]
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

    await user.click(screen.getByRole('link', { name: 'خانه' }))

    const bodyTable = (await screen.findAllByRole('table'))[1]
    expect(
      await within(bodyTable).findByRole('link', { name: 'گزارش تازه' }),
    ).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('restores the exact list scroll position after a document is opened and the home page is revisited', async () => {
    const documents = Array.from({ length: 75 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    const { get } = installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/', { seedDocuments: documents })
    await screen.findByRole('link', { name: 'سند 0' })

    await scrollListTo(1500)
    await user.click(screen.getByRole('link', { name: 'سند 40' }))
    await screen.findByRole('heading', { name: 'سند 40' })
    expect(get).toHaveBeenCalledWith(41)

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۷۵)' })

    const main = screen.getByRole('main')
    expect(listViewport().scrollTop).toBe(1500)
    expect(
      within(main).getByRole('link', { name: 'سند 40' }),
    ).toBeInTheDocument()
    expect(
      within(main).queryByRole('link', { name: 'سند 0' }),
    ).not.toBeInTheDocument()
  })

  it('restores the exact measured row heights after opening a document', async () => {
    const documents = Array.from({ length: 75 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    installDocumentsBridge(documents)
    const user = userEvent.setup()
    const defaultRowRect = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        const index = this.getAttribute('data-index')
        if (index === null) {
          return defaultRowRect.call(this)
        }
        return new DOMRect(0, 0, 0, Number(index) % 3 === 0 ? 64 : 37)
      },
    )

    renderRoute('/', {
      seedDocuments: documents,
      seedHomeScroll: {
        offset: 1500,
        measurements: measuredRowItems(documents.length),
      },
    })
    await screen.findAllByRole('link', { name: /^سند / })
    await vi.waitFor(() => {
      expect(listViewport().scrollTop).toBe(1500)
    })

    const main = screen.getByRole('main')
    const titlesBefore = within(main)
      .getAllByRole('link', { name: /^سند / })
      .map((link) => link.textContent ?? '')
    expect(titlesBefore[0]).toBe('سند 24')
    const clickedTitle = titlesBefore[titlesBefore.length - 1]
    await user.click(within(main).getByRole('link', { name: clickedTitle }))
    await screen.findByRole('heading', { name: clickedTitle })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۷۵)' })

    expect(listViewport().scrollTop).toBe(1500)
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('link', { name: /^سند / })
        .map((link) => link.textContent ?? ''),
    ).toEqual(titlesBefore)
    expect(readHomeMeasurements()).toHaveLength(documents.length)
  })

  it('saves the measured row heights when a document is opened', async () => {
    const documents = Array.from({ length: 75 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    installDocumentsBridge(documents)
    const user = userEvent.setup()
    const defaultRowRect = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        const index = this.getAttribute('data-index')
        if (index === null) {
          return defaultRowRect.call(this)
        }
        return new DOMRect(0, 0, 0, Number(index) % 3 === 0 ? 64 : 37)
      },
    )

    renderRoute('/', { seedDocuments: documents })
    await screen.findByRole('link', { name: 'سند 0' })

    await user.click(screen.getByRole('link', { name: 'سند 0' }))
    await screen.findByRole('heading', { name: 'سند 0' })

    expect(readHomeMeasurements()).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 1, size: 64 })]),
    )
  })

  it('restores the exact list scroll position after the open document is deleted', async () => {
    const documents = Array.from({ length: 75 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    installDocumentsBridge(documents)
    const user = userEvent.setup()

    renderRoute('/', { seedDocuments: documents })
    await screen.findByRole('link', { name: 'سند 0' })

    await scrollListTo(1500)
    await user.click(screen.getByRole('link', { name: 'سند 40' }))
    await screen.findByRole('heading', { name: 'سند 40' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(await screen.findByRole('button', { name: 'بله' }))

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۷۴)' }),
    ).toBeInTheDocument()
    expect(listViewport().scrollTop).toBe(1500)
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'سند 41' }),
    ).toBeInTheDocument()
  })

  it('starts the list at the top after a document is created', async () => {
    const documents = Array.from({ length: 75 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    const created = { ...storedDocument, id: 100, title: 'بدون عنوان' }
    const list = vi.fn(async (options: DocumentListOptions) =>
      documentListPage([created, ...documents], options),
    )
    installBridge({
      create: vi.fn(async () => created),
      get: vi.fn(async (id: number) =>
        id === created.id ? created : documents.find((row) => row.id === id),
      ),
      count: vi.fn(async () => documents.length + 1),
      list,
    })
    const user = userEvent.setup()

    renderRoute('/', { seedDocuments: documents })
    await screen.findByRole('link', { name: 'سند 0' })

    await scrollListTo(1500)
    await user.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۷۶)' })

    expect(listViewport().scrollTop).toBe(0)
    expect(
      await within(screen.getByRole('main')).findByRole('link', {
        name: 'بدون عنوان',
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'سند 0' }),
    ).toBeInTheDocument()
  })

  it('mounts only the rows around the visible part of the list body', async () => {
    const documents = Array.from({ length: 120 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    installBridge()

    renderRoute('/', { seedDocuments: documents })

    const firstTitle = await screen.findByRole('link', { name: 'سند 0' })
    const viewport = firstTitle.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )
    if (!viewport) {
      throw new Error('the list body is missing its scroll area viewport')
    }

    const titlesAtTop = screen
      .getAllByRole('link', { name: /^سند / })
      .map((link) => link.textContent)
    expect(titlesAtTop).toHaveLength(25)
    expect(titlesAtTop).not.toContain('سند 119')

    await act(() => {
      viewport.scrollTop = 2960
      viewport.dispatchEvent(new Event('scroll'))
    })

    const titlesAfterScroll = screen
      .getAllByRole('link', { name: /^سند / })
      .map((link) => link.textContent)
    expect(titlesAfterScroll).toHaveLength(33)
    expect(titlesAfterScroll[0]).toBe('سند 72')
    expect(titlesAfterScroll).toContain('سند 80')
    expect(titlesAfterScroll).not.toContain('سند 0')
    expect(titlesAfterScroll).not.toContain('سند 119')
  })

  it('keeps the whole list scrollable with spacer rows while a window of rows is mounted', async () => {
    const documents = Array.from({ length: 120 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    installBridge()

    renderRoute('/', { seedDocuments: documents })

    const firstTitle = await screen.findByRole('link', { name: 'سند 0' })
    const viewport = firstTitle.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )
    if (!viewport) {
      throw new Error('the list body is missing its scroll area viewport')
    }

    const spacerHeights = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-slot="table-row-spacer"]',
        ),
      ).map((spacer) => Number.parseFloat(spacer.style.height))

    expect(spacerHeights()).toEqual([0, 3515])

    await act(() => {
      viewport.scrollTop = 3840
      viewport.dispatchEvent(new Event('scroll'))
    })

    expect(screen.getByRole('link', { name: 'سند 119' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'سند 0' }),
    ).not.toBeInTheDocument()
    expect(spacerHeights()).toEqual([3515, 0])
  })

  it('re-renders only the rows that enter the window while scrolling', async () => {
    const documents = Array.from({ length: 120 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    installBridge()

    renderRoute('/', { seedDocuments: documents })

    const firstTitle = await screen.findByRole('link', { name: 'سند 0' })
    const viewport = firstTitle.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )
    if (!viewport) {
      throw new Error('the list body is missing its scroll area viewport')
    }

    dateSpies.formatRelativeTime.mockClear()

    await act(() => {
      viewport.scrollTop = 37
      viewport.dispatchEvent(new Event('scroll'))
    })

    expect(screen.getAllByRole('link', { name: /^سند / })).toHaveLength(26)
    expect(dateSpies.formatRelativeTime.mock.calls.length).toBeLessThan(5)
  })

  it('keeps the mounted window bounded when the rows cannot be measured', async () => {
    const documents = Array.from({ length: 120 }, (_, index) => ({
      ...storedDocument,
      id: index + 1,
      title: `سند ${index}`,
    }))
    installBridge()

    const unmeasurable = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect())

    try {
      renderRoute('/', { seedDocuments: documents })

      await screen.findByRole('link', { name: 'سند 0' })

      await act(async () => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 100)
        })
      })

      const titles = screen.getAllByRole('link', { name: /^سند / })
      expect(titles.length).toBeLessThan(40)
    } finally {
      unmeasurable.mockRestore()
    }
  })
})
