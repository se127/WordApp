import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient, documentsCountQuery } from '@/lib/query'
import { createAppRouter } from '@/router'
import type { DocumentChanges } from '@/types/global'
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
// `count` reports what `create` stored, the way the database would, and `get`
// returns the stored row — starting as `storedDocument` and following what
// `save` stored; a test can take over a call to hold it open and observe the
// page mid-read: `create` (the button's own spinner), `get` (the content
// box's pending spinner, or its failed-read report and retry), `count` (the
// heading's inline loader, or its pulsing stale number), `save` (the title
// input's spinner), or `remove` (the bridge's delete — named around the
// reserved word — held open to watch the delete dialog mid-write).
function installBridge(
  options: {
    create?: () => Promise<typeof storedDocument>
    get?: () => Promise<typeof storedDocument>
    count?: () => Promise<number>
    save?: (
      id: number,
      changes: DocumentChanges,
    ) => Promise<typeof storedDocument | undefined>
    remove?: () => Promise<void>
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

  window.WordApp = {
    platform: 'win32',
    documents: { create, get, count, save, delete: remove },
  } satisfies WordAppBridge

  return { create, get, count, save, remove }
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

  it('shows the pending spinner under the back button while the document row is loading, then the title with its options menu', async () => {
    let finishGet!: (document: typeof storedDocument) => void
    const get = vi.fn(
      () =>
        new Promise<typeof storedDocument>((resolve) => {
          finishGet = resolve
        }),
    )
    installBridge({ get })

    renderRoute('/documents/1')

    // The page is not held back while the row reads: the back button — alone
    // on the first line, so the page is never a dead end even mid-read — is
    // up right away while the loader fills what is under it; the title's
    // line, and with it the options menu, waits for the row.
    await screen.findByRole('button', { name: 'تغییر پوسته' })
    expect(
      await screen.findByRole('status', { name: 'در حال بارگذاری' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'بازگشت به مستندات' }),
    ).toBeInTheDocument()
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

  it('shows the stored title as a full-width heading at the icon-button height that truncates, tints on hover and focus, and borders on focus', async () => {
    installBridge()

    renderRoute('/documents/1')

    const heading = await screen.findByRole('heading', { name: 'بدون عنوان' })
    // The heading fills the title line's free width at the options button's
    // own height (h-8) and truncates, so a long title never pushes the
    // options button around.
    expect(heading).toHaveClass('h-8', 'min-w-0', 'flex-1', 'truncate')
    // The cursor stays the default arrow — the text cursor belongs to the
    // input alone — and hovering or focusing tints it with a color
    // transition (bg-gray-100 in light, bg-zinc-700 in dark); taking focus
    // shows the border in the input's own border color.
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

    // The input sits exactly where the heading was — the icon-button height,
    // nothing but a border around the text — with the whole title selected,
    // so typing replaces it.
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

    // The page's focus order is the window strip's theme button, the back
    // button, then the title: the third Tab lands on the heading, which keeps
    // being the heading — just with its focus border — and saves nothing.
    await user.tab()
    await user.tab()
    await user.tab()

    expect(heading).toHaveFocus()
    expect(heading).toHaveClass('focus:border-input')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()

    // Space is the heading's edit key: it swaps in the input — the whole
    // title selected, same as a click — and must not leak a space into it.
    await user.keyboard(' ')

    const input = await screen.findByRole<HTMLInputElement>('textbox', {
      name: 'عنوان سند',
    })
    expect(input).toHaveValue('بدون عنوان')
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('بدون عنوان'.length)

    // Tabbing away blurs the input; nothing changed, so it drops back to the
    // heading without a save.
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

    // Enter opens the input with the whole title selected; typing replaces
    // it, and the second Enter commits — the save goes out — and hands the
    // keyboard back to the heading.
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

    // The heading still holds the keyboard: Enter reopens the input, and a
    // no-change Enter brings the heading back with focus again — no second
    // save. Tab then moves on from the heading itself, to the options button.
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

    // Typing alone saves nothing: the write waits for the blur.
    expect(save).not.toHaveBeenCalled()

    await user.tab()

    expect(save).toHaveBeenCalledExactlyOnceWith(1, {
      title: 'گزارش سالانه',
    })
    expect(
      await screen.findByRole('heading', { name: 'گزارش سالانه' }),
    ).toBeInTheDocument()

    // The save invalidated the row's query, so the row was read again — once
    // at load, once after the save.
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
    // While idle the input's end padding matches its start padding.
    expect(input).not.toHaveClass('pe-8')
    await user.clear(input)
    await user.type(input, 'پیگیری')
    await user.tab()

    // The save is slow (like a write under the dev script's --db-delay): the
    // edited text stays on screen in a disabled input with a spinner. The
    // spinner sits in the input's end corner, so the input pads that side
    // too — a full title never runs under the spinner.
    const pending = screen.getByRole('textbox', { name: 'عنوان سند' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveValue('پیگیری')
    expect(pending).toHaveClass('pe-8')
    expect(pending.parentElement?.querySelector('svg')).toHaveClass(
      'animate-spin',
    )

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

  it('keeps the saved title on screen while the row re-reads', async () => {
    let reads = 0
    let finishReread!: (document: typeof storedDocument) => void
    const get = vi.fn((): Promise<typeof storedDocument> => {
      reads += 1
      // The first read answers with the row; the re-read after the save (the
      // invalidation) stays open until the test releases it.
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

    // The row's re-read is held open (like a read under --db-delay): the
    // title the user just saved stands, with no bounce back to the old one
    // and no loading state.
    expect(
      await screen.findByRole('heading', { name: 'گزارش' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    await vi.waitFor(() => expect(finishReread).toBeTypeOf('function'))
    await act(() =>
      finishReread({ ...storedDocument, title: 'گزارش', updatedAt: 1_001 }),
    )

    expect(
      await screen.findByRole('heading', { name: 'گزارش' }),
    ).toBeInTheDocument()
  })

  it('reports a failed save with an error toast and keeps the edited text for another try', async () => {
    let attempts = 0
    let storedRow = storedDocument
    const get = vi.fn(async () => storedRow)
    const save = vi.fn(async (_id: number, changes: DocumentChanges) => {
      attempts += 1
      // The first save fails (a stand-in for the dev script's
      // --with-db-failure); the retry stores the change for real.
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

    // The toast tells the user the save failed and to try again; the store's
    // technical message stays out of it.
    expect(
      await screen.findByText('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The saveDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    // The edited text stayed in the input — nothing was lost — and the caret
    // came back to it, so blurring again retries the save.
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

  it('shows the back button with its icon and label, without a tooltip', async () => {
    installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    const backLink = await screen.findByRole('link', {
      name: 'بازگشت به مستندات',
    })

    // The label is the button's own text and the icon points right — the
    // back direction in the RTL layout — so nothing explains it through a
    // tooltip; hovering it raises none.
    expect(backLink.querySelector('svg')).toHaveClass('lucide-arrow-right')
    await user.hover(backLink)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('offers delete in the options menu and asks for confirmation before deleting', async () => {
    const { remove } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    // The options button is an ellipsis icon button; its menu holds the
    // delete item with its trash icon.
    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    const deleteItem = await screen.findByRole('menuitem', { name: 'حذف' })
    expect(deleteItem.querySelector('svg')).toHaveClass('lucide-trash')
    expect(deleteItem).toHaveAttribute('data-variant', 'destructive')
    await user.click(deleteItem)

    // Deleting is not immediate: the confirmation dialog spells out what is
    // being asked, with the destructive confirm and the cancel.
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

    // The menu stayed open under the dialog — the modal dialog hides it from
    // assistive tech with aria-hidden, but it is still mounted — and nothing
    // was deleted yet.
    expect(
      screen.getByRole('menuitem', { hidden: true, name: 'حذف' }),
    ).toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
  })

  it('keeps the menu open when the delete dialog is dismissed', async () => {
    const { remove } = installBridge()
    const user = userEvent.setup()

    renderRoute('/documents/1')
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    const dialog = await screen.findByRole('alertdialog')

    // انصراف dismisses the dialog and leaves the menu it was opened from.
    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }))
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('menuitem', { name: 'حذف' })).toBeInTheDocument()

    // Esc dismisses it the same way.
    await user.click(screen.getByRole('menuitem', { name: 'حذف' }))
    await screen.findByRole('alertdialog')
    await user.keyboard('{Escape}')
    await vi.waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('menuitem', { name: 'حذف' })).toBeInTheDocument()

    // Neither dismissal deleted the document.
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

    // The delete is in flight (like a write under --db-delay): the confirm
    // button carries the pending label with a spinning icon, and both
    // buttons are disabled...
    expect(remove).toHaveBeenCalledWith(1)
    const confirm = screen.getByRole('button', { name: 'در حال حذف...' })
    expect(confirm).toBeDisabled()
    expect(confirm.querySelector('svg')).toHaveClass('animate-spin')
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeDisabled()

    // ...and Esc cannot take the dialog down mid-write.
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Released, the delete lands: home, with the success toast.
    await act(() => finishDelete())
    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (0)' }),
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
    await screen.findByRole('heading', { name: 'مستندات (1)' })

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

    // Back on the home page, the count was read again — the delete
    // invalidated it — and shows the store's new number.
    expect(
      await screen.findByRole('heading', { name: 'مستندات (0)' }),
    ).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith(1)
    expect(count).toHaveBeenCalledTimes(2)

    // The deleted row is out of the query cache: reopening its page reads
    // the database again instead of showing the cached copy.
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
      // The first delete fails (a stand-in for the dev script's
      // --with-db-failure); the retry removes the row for real.
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

    // The toast tells the user the delete failed and to try again; the
    // store's technical message stays out of it.
    expect(
      await screen.findByText('حذف سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'The deleteDocument operation failed (injected by --with-db-failure)',
      ),
    ).not.toBeInTheDocument()

    // The dialog stayed open with its buttons ready for another try, and no
    // success toast was raised.
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: 'انصراف' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'بله' })).toBeEnabled()
    expect(screen.queryByText('سند حذف شد.')).not.toBeInTheDocument()

    // The second attempt goes through and lands home.
    await user.click(within(dialog).getByRole('button', { name: 'بله' }))
    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (0)' }),
    ).toBeInTheDocument()
    expect(remove).toHaveBeenCalledTimes(2)
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
