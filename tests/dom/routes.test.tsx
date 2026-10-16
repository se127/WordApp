import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/lib/query'
import { createAppRouter } from '@/router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

type WordAppBridge = Window['WordApp']

const storedDocument = {
  id: 1,
  title: 'بدون عنوان',
  body: '',
  createdAt: 1_000,
  updatedAt: 1_000,
}

// `window.WordApp` is the preload bridge (src/types/global.d.ts); every test
// installs its own stub of it and observes what the pages send through it.
// `count` reports what `create` stored, the way the database would; a test can
// take over a call to hold it open and observe the page mid-read: `create`
// (the button's own spinner), `get` (the content box's pending spinner), or
// `count` (the heading's inline loader, or its pulsing stale number).
function installBridge(
  options: {
    create?: () => Promise<typeof storedDocument>
    get?: () => Promise<typeof storedDocument>
    count?: () => Promise<number>
  } = {},
) {
  let storedCount = 0
  const create =
    options.create ??
    vi.fn(async () => {
      storedCount += 1
      return storedDocument
    })
  const get = options.get ?? vi.fn(async () => storedDocument)
  const count = options.count ?? vi.fn(async () => storedCount)

  window.WordApp = {
    platform: 'win32',
    windowControls: {
      close: vi.fn(),
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn(() => vi.fn()),
    },
    documents: { create, get, count },
  } satisfies WordAppBridge

  return { create, get, count }
}

// Mirrors the provider stack from src/main.tsx plus the QueryClientProvider
// from src/App.tsx, over a router that starts at the given entry instead of
// the real hash history. Each call builds a fresh QueryClient, so no query
// cache leaks between tests.
function renderRoute(initialEntry: string) {
  const queryClient = createQueryClient()
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

  return router
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('routes', () => {
  it('shows the documents heading with its count and the add-document button', async () => {
    const { count } = installBridge()

    renderRoute('/')

    expect(
      await screen.findByRole('heading', { name: 'مستندات (0)' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'افزودن سند' }),
    ).toBeInTheDocument()
    expect(count).toHaveBeenCalledOnce()
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

    // The page is not held back while the count reads: the heading shows its
    // loader in the number's place, and the button is already there.
    const heading = await screen.findByRole('heading')
    expect(within(heading).getByRole('status')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'افزودن سند' }),
    ).toBeInTheDocument()

    await act(() => finishCount(3))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (3)' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the stale count pulsing instead of the loader while an invalidated count re-reads', async () => {
    let reads = 0
    let finishRefetch!: (count: number) => void
    const count = vi.fn((): Promise<number> => {
      reads += 1
      // The first read answers right away; the re-read after the create (the
      // invalidation) stays open until the test releases it.
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
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    // Creating a document invalidates the count; its re-read is held open.
    await user.click(screen.getByRole('button', { name: 'افزودن سند' }))
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    // The previous count is still on screen, pulsing, and no loader replaces
    // it; the fresh number lands once the re-read finishes.
    const staleCount = await screen.findByText('(0)')
    expect(staleCount).toHaveClass('animate-pulse')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await act(() => finishRefetch(1))

    expect(await screen.findByText('(1)')).not.toHaveClass('animate-pulse')
  })

  it('shows the pending spinner in the content box while the document row is loading', async () => {
    let finishGet!: (document: typeof storedDocument) => void
    const get = vi.fn(
      () =>
        new Promise<typeof storedDocument>((resolve) => {
          finishGet = resolve
        }),
    )
    installBridge({ get })

    renderRoute('/documents/1')

    // The shell is up right away; only the content box waits on the row.
    await screen.findByRole('button', { name: 'بستن' })
    expect(
      await screen.findByRole('status', { name: 'در حال بارگذاری' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()

    await act(() => finishGet(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('creates an untitled document and opens its page', async () => {
    const { create, get } = installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(await screen.findByRole('button', { name: 'افزودن سند' }))

    expect(create).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(1)
  })

  it('disables the button and shows a spinner while the document is being created', async () => {
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
    await user.click(await screen.findByRole('button', { name: 'افزودن سند' }))

    const button = screen.getByRole('button', { name: 'در حال ساخت سند...' })
    expect(button).toBeDisabled()
    expect(button.querySelector('svg')).toHaveClass('animate-spin')

    await act(() => finishCreate(storedDocument))

    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
  })

  it('returns to the home page through the back button', async () => {
    const { get } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    expect(
      await screen.findByRole('heading', { name: 'بدون عنوان' }),
    ).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(1)

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (0)' }),
    ).toBeInTheDocument()
  })

  it('explains the back button with a tooltip', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await user.hover(
      await screen.findByRole('link', { name: 'بازگشت به مستندات' }),
    )

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'بازگشت به مستندات',
    )
  })

  it('reuses the cached count when the home page is revisited without a write', async () => {
    const { count, get } = installBridge()
    const user = userEvent.setup()

    const router = renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))

    // Nothing was written while the user was away, so the cached count is
    // still fresh: it stands, un-pulsed, and neither read happened twice.
    expect(
      await screen.findByRole('heading', { name: 'مستندات (0)' }),
    ).toBeInTheDocument()
    expect(screen.getByText('(0)')).not.toHaveClass('animate-pulse')
    expect(get).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledOnce()
  })

  it('re-reads the count once after a document is created', async () => {
    const { create, count } = installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    // The create invalidates the count; the heading shows the re-read number
    // once the user is back home.
    await user.click(screen.getByRole('button', { name: 'افزودن سند' }))
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    expect(
      await screen.findByRole('heading', { name: 'مستندات (1)' }),
    ).toBeInTheDocument()

    expect(create).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledTimes(2)
  })

  it('reads a document row once and reuses it when the page is opened again', async () => {
    const { get, count } = installBridge()
    const user = userEvent.setup()

    const router = renderRoute('/')
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    await act(() =>
      router.navigate({
        to: '/documents/$documentId',
        params: { documentId: '1' },
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    // Nothing changed the row, so the second opening came from the cache.
    expect(get).toHaveBeenCalledOnce()
    expect(count).toHaveBeenCalledOnce()
  })
})
