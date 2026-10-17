import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient, documentsCountQuery } from '@/lib/query'
import { createAppRouter } from '@/router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
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
// (the button's own spinner), `get` (the content box's pending spinner, or its
// failed-read report and retry), or `count` (the heading's inline loader, or
// its pulsing stale number).
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
    documents: { create, get, count },
  } satisfies WordAppBridge

  return { create, get, count }
}

// Mirrors the provider stack from src/main.tsx plus the QueryClientProvider
// from src/App.tsx, over a router that starts at the given entry instead of
// the real hash history. Each call builds a fresh QueryClient, so no query
// cache leaks between tests. The client comes back along with the router so a
// test can drive cache changes the UI would trigger itself (the create flow's
// count invalidation, say).
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

  return { router, queryClient }
}

afterEach(() => {
  // Sonner keeps its toasts in a store of its own, outside React; drop them
  // so a lingering toast cannot leak into the next test.
  toast.dismiss()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('routes', () => {
  it('shows the documents heading with its count and the add-document button', async () => {
    const { count } = installBridge()

    renderRoute('/')

    const heading = await screen.findByRole('heading', {
      name: 'مستندات (0)',
    })
    expect(heading).toBeInTheDocument()
    // The heading is one fixed-height flex line, so the count's spot swapping
    // states (number, loader, retry button) never changes the heading's
    // height and moves what sits under it.
    expect(heading).toHaveClass('flex', 'h-8', 'items-center')
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

  it('shows a destructive retry button when the count read fails and recovers the count when pressed', async () => {
    let attempts = 0
    const count = vi.fn((): Promise<number> => {
      attempts += 1
      // The first read fails (a stand-in for the dev script's
      // --with-db-failure); the retry reads the count for real.
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
    // The retry keeps its destructive color on hover: the class it passes
    // wins over the outline variant's own hover color in the merge.
    expect(retry).toHaveClass('text-destructive', 'hover:text-destructive')
    expect(retry).not.toHaveClass('hover:text-foreground')

    await user.click(retry)

    expect(
      await screen.findByRole('heading', { name: 'مستندات (2)' }),
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
      // The first read fails (a stand-in for the dev script's
      // --with-db-failure); the retry stays open until the test releases it.
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

    // The re-read is slow (like a read under --db-delay): the number's spot
    // holds the heading's loader while it runs, and the button is gone with
    // it.
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
      await screen.findByRole('heading', { name: 'مستندات (5)' }),
    ).toBeInTheDocument()
  })

  it('keeps the retry button busy while a stale count is read again', async () => {
    let reads = 0
    let finishRetry!: (count: number) => void
    const count = vi.fn((): Promise<number> => {
      reads += 1
      // The first read answers; the invalidation's re-read fails, leaving the
      // stale number on screen with the error; the retry stays open until the
      // test releases it.
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
    await screen.findByRole('heading', { name: 'مستندات (3)' })

    // What a create does to the count: invalidate it and read it again. This
    // re-read fails, so the number's spot shows the retry button.
    await act(async () => {
      await queryClient
        .invalidateQueries({ queryKey: documentsCountQuery.queryKey })
        .catch(() => {})
    })

    const retry = await screen.findByRole('button', {
      name: 'تلاش دوباره برای دریافت تعداد سندها',
    })

    // The button is busy while the retry it starts is in flight (the case the
    // button itself outlives): disabled, with its icon spinning, so a slow
    // retry stays visible.
    await user.click(retry)
    const busy = screen.getByRole('button', {
      name: 'تلاش دوباره برای دریافت تعداد سندها',
    })
    expect(busy).toBeDisabled()
    expect(busy.querySelector('svg')).toHaveClass('animate-spin')

    await vi.waitFor(() => expect(finishRetry).toBeTypeOf('function'))
    await act(() => finishRetry(4))

    expect(
      await screen.findByRole('heading', { name: 'مستندات (4)' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'تلاش دوباره برای دریافت تعداد سندها',
      }),
    ).not.toBeInTheDocument()
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
    await screen.findByRole('button', { name: 'تغییر پوسته' })
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

  it('reports a failed document read with an error and a retry button, and recovers the document when pressed', async () => {
    let attempts = 0
    const get = vi.fn((): Promise<typeof storedDocument> => {
      attempts += 1
      // The first read fails (a stand-in for the dev script's
      // --with-db-failure); the retry reads the row for real.
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

    // The failed read is reported in the content box — no technical detail —
    // and the retry button takes the read again; the back button stays, so
    // the page is never a dead end.
    expect(
      await screen.findByText('بارگذاری سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'بازگشت به مستندات' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The getDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    const retry = screen.getByRole('button', {
      name: 'تلاش دوباره برای بارگذاری سند',
    })
    // The retry keeps its destructive color on hover: the class it passes
    // wins over the outline variant's own hover color in the merge.
    expect(retry).toHaveClass('text-destructive', 'hover:text-destructive')
    expect(retry).not.toHaveClass('hover:text-foreground')

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
      // The first read fails (a stand-in for the dev script's
      // --with-db-failure); the retry stays open until the test releases it.
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
        name: 'تلاش دوباره برای بارگذاری سند',
      }),
    )

    // The re-read is slow (like a read under --db-delay): the content box
    // holds the pending spinner while it runs, and the failed report is gone
    // with it.
    expect(
      await screen.findByRole('status', { name: 'در حال بارگذاری' }),
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

  it('explains the document retry button with a tooltip', async () => {
    const get = vi.fn(async (): Promise<typeof storedDocument> => {
      throw new Error('document read failed')
    })
    installBridge({ get })
    const user = userEvent.setup()

    renderRoute('/documents/1')

    await user.hover(
      await screen.findByRole('button', {
        name: 'تلاش دوباره برای بارگذاری سند',
      }),
    )

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'تلاش دوباره برای بارگذاری سند',
    )
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

    const { router } = renderRoute('/')
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

  it('reports a failed create with an error toast and stays on the home page', async () => {
    const create = vi.fn(async () => {
      throw new Error(
        'The createDocument operation failed (injected by --with-db-failure)',
      )
    })
    const { count } = installBridge({ create })
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(await screen.findByRole('button', { name: 'افزودن سند' }))

    // The toast tells the user the create failed and to try again; the
    // store's technical message stays out of it.
    expect(
      await screen.findByText('افزودن سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The createDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    // No document page opened, the count was not invalidated (its read ran
    // once, at load), and the button is ready for another try.
    expect(
      screen.getByRole('heading', { name: 'مستندات (0)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'افزودن سند' })).toBeEnabled()
    expect(count).toHaveBeenCalledOnce()
  })

  it('shows no toast when the create succeeds and opens the new document', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(await screen.findByRole('button', { name: 'افزودن سند' }))

    await screen.findByRole('heading', { name: 'بدون عنوان' })

    expect(
      screen.queryByText('افزودن سند ناموفق بود. دوباره تلاش کنید.'),
    ).not.toBeInTheDocument()
  })

  it('reads a document row once and reuses it when the page is opened again', async () => {
    const { get, count } = installBridge()
    const user = userEvent.setup()

    const { router } = renderRoute('/')
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
