import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/lib/query'
import { createAppRouter } from '@/router'
import type {
  DocumentChanges,
  DocumentListOptions,
  DocumentListPage,
  DocumentRecord,
} from '@/types/global'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

function storedDocument(id: number, title: string): DocumentRecord {
  return { id, title, body: '', createdAt: id, updatedAt: id }
}

function installBridge(
  documents: DocumentRecord[],
  overrides: {
    get?: (id: number) => Promise<DocumentRecord | undefined>
  } = {},
) {
  const rows = [...documents]

  const create = vi.fn(async () => {
    const created = storedDocument(rows.length + 1, 'بدون عنوان')
    rows.push(created)
    return created
  })
  const get =
    overrides.get ??
    vi.fn(async (id: number) => rows.find((row) => row.id === id))
  const count = vi.fn(async () => rows.length)
  const list = vi.fn(
    async (options: DocumentListOptions): Promise<DocumentListPage> => ({
      documents: rows.slice(0, options.limit),
      nextCursor: null,
    }),
  )
  const save = vi.fn(async (id: number, changes: DocumentChanges) => {
    const index = rows.findIndex((row) => row.id === id)
    if (index === -1) {
      return undefined
    }
    rows[index] = {
      ...rows[index],
      ...changes,
      updatedAt: rows[index].updatedAt + 1,
    }
    return rows[index]
  })
  const remove = vi.fn(async (id: number) => {
    const index = rows.findIndex((row) => row.id === id)
    if (index >= 0) {
      rows.splice(index, 1)
    }
  })
  const removeMany = vi.fn(async (ids: number[]) => {
    for (const id of ids) {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) {
        rows.splice(index, 1)
      }
    }
  })

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
  } satisfies Window['WordApp']

  return { rows, create, get, count, list, save, remove, removeMany }
}

function renderApp(initialEntry: string) {
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

function tabsStrip(): HTMLElement {
  const strip = document.querySelector<HTMLElement>(
    '[data-slot="document-tabs"]',
  )
  if (!strip) {
    throw new Error('the title bar is missing its document tabs strip')
  }
  return strip
}

function tabsArea(): HTMLElement {
  const area = tabsStrip().parentElement
  if (!(area instanceof HTMLElement)) {
    throw new Error('the document tabs strip has no layout parent')
  }
  return area
}

function tabTitles(): Array<string | null> {
  return within(tabsStrip())
    .queryAllByRole('link')
    .map((link) => link.textContent)
}

function tabFor(title: string): HTMLElement {
  const tab = within(tabsStrip())
    .getByRole('link', { name: title })
    .closest('[data-slot="document-tab"]')
  if (!(tab instanceof HTMLElement)) {
    throw new Error(`the tab for "${title}" is missing`)
  }
  return tab
}

function tabLink(title: string): HTMLElement {
  return within(tabFor(title)).getByRole('link', { name: title })
}

function stubStripScroll(
  strip: HTMLElement,
  {
    scrollWidth,
    clientWidth,
    clamp,
  }: {
    scrollWidth: number
    clientWidth: number
    clamp?: (value: number) => number
  },
) {
  let scrollLeft = 0
  let writes = 0

  Object.defineProperty(strip, 'scrollWidth', {
    configurable: true,
    value: scrollWidth,
  })
  Object.defineProperty(strip, 'clientWidth', {
    configurable: true,
    value: clientWidth,
  })
  Object.defineProperty(strip, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      writes += 1
      scrollLeft = clamp === undefined ? value : clamp(value)
    },
  })

  return {
    scrollLeft: () => scrollLeft,
    writes: () => writes,
    async scrollTo(value: number) {
      await act(() => {
        scrollLeft = value
        strip.dispatchEvent(new Event('scroll'))
      })
    },
  }
}

async function closeTab(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  await user.click(
    within(tabFor(title)).getByRole('button', { name: 'بستن سند' }),
  )
}

afterEach(() => {
  toast.dismiss()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('document tabs', () => {
  it('adds a tab with the clicked document title and marks it as the open one', async () => {
    installBridge([storedDocument(1, 'یادداشت'), storedDocument(2, 'گزارش')])
    const user = userEvent.setup()

    renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    expect(tabTitles()).toEqual(['گزارش'])
    const tab = tabFor('گزارش')
    expect(tab).toHaveClass('border-border', 'bg-white')
    expect(within(tab).getByRole('button', { name: 'بستن سند' })).toHaveClass(
      'size-6',
    )
    expect(tabsStrip().parentElement?.nextElementSibling).toBe(
      screen.getByRole('link', { name: 'خانه' }).parentElement,
    )
  })

  it('splits the WordApp name from the tabs with a separator once a tab is open', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const user = userEvent.setup()

    renderApp('/')
    await screen.findByRole('heading', { name: 'مستندات (۱)' })

    const area = tabsArea()

    expect(area.querySelector('[data-slot="separator"]')).toBeNull()

    await user.click(await screen.findByRole('link', { name: 'یادداشت' }))
    await screen.findByRole('heading', { name: 'یادداشت' })

    const separator = area.firstElementChild
    expect(separator).toHaveAttribute('data-slot', 'separator')
    expect(separator).toHaveAttribute('data-orientation', 'vertical')
    expect(separator).toHaveClass('me-2', 'my-auto', 'h-8')
    expect(separator?.nextElementSibling).toBe(tabsStrip())

    const scroll = stubStripScroll(tabsStrip(), {
      scrollWidth: 600,
      clientWidth: 200,
    })
    await scroll.scrollTo(-200)

    expect(area.firstElementChild).toBe(separator)
    expect(separator?.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'نمایش تب های بعدی' }),
    )

    await closeTab(user, 'یادداشت')

    await screen.findByRole('heading', { name: 'مستندات (۱)' })
    expect(area.querySelector('[data-slot="separator"]')).toBeNull()
  })

  it('opens a tab for a document created with the add button', async () => {
    installBridge([])
    const user = userEvent.setup()

    renderApp('/')
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    await user.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'افزودن سند',
      }),
    )
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    expect(tabTitles()).toEqual(['بدون عنوان'])
  })

  it('waits for a pending document read before opening its tab, and asks again when the read fails', async () => {
    let attempts = 0
    let finishRetry!: (document: DocumentRecord) => void
    const row = storedDocument(1, 'یادداشت')
    const get = vi.fn((): Promise<DocumentRecord | undefined> => {
      attempts += 1
      if (attempts === 1) {
        return Promise.reject(new Error('document read failed'))
      }
      return new Promise<DocumentRecord | undefined>((resolve) => {
        finishRetry = resolve
      })
    })
    installBridge([row], { get })
    const user = userEvent.setup()

    renderApp('/documents/1')

    expect(
      await screen.findByText('بارگذاری سند ناموفق بود. دوباره تلاش کنید.'),
    ).toBeInTheDocument()
    expect(tabTitles()).toEqual([])

    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))

    expect(
      await screen.findByRole('status', { name: 'در حال بارگذاری سند' }),
    ).toBeInTheDocument()
    expect(tabTitles()).toEqual([])

    await vi.waitFor(() => expect(finishRetry).toBeTypeOf('function'))
    await act(() => finishRetry(row))

    expect(
      await screen.findByRole('heading', { name: 'یادداشت' }),
    ).toBeInTheDocument()
    expect(tabTitles()).toEqual(['یادداشت'])
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('appends every new tab after the last one, in the order the documents were opened', async () => {
    installBridge([storedDocument(1, 'یادداشت'), storedDocument(2, 'گزارش')])
    const user = userEvent.setup()

    renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'یادداشت' }))
    await screen.findByRole('heading', { name: 'یادداشت' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۲)' })

    await user.click(screen.getByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    expect(tabTitles()).toEqual(['یادداشت', 'گزارش'])
    expect(tabFor('گزارش')).toHaveClass('border-border')
    expect(tabFor('یادداشت')).toHaveClass('border-transparent')
  })

  it('scrolls the tab layout to a tab it just opened', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    await vi.waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(tabFor('یادداشت'))
  })

  it('keeps one tab per document when the same title is opened again', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const user = userEvent.setup()

    renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'یادداشت' }))
    await screen.findByRole('heading', { name: 'یادداشت' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۱)' })

    await user.click(within(screen.getAllByRole('table')[1]).getByRole('link'))
    await screen.findByRole('heading', { name: 'یادداشت' })

    expect(tabTitles()).toEqual(['یادداشت'])
  })

  it('navigates to the tab document when a tab is picked', async () => {
    installBridge([storedDocument(1, 'یادداشت'), storedDocument(2, 'گزارش')])
    const user = userEvent.setup()

    const { router } = renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'یادداشت' }))
    await screen.findByRole('heading', { name: 'یادداشت' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۲)' })

    await user.click(screen.getByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    await user.click(within(tabsStrip()).getByRole('link', { name: 'یادداشت' }))

    expect(
      await screen.findByRole('heading', { name: 'یادداشت' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/documents/1')
    expect(tabFor('یادداشت')).toHaveClass('border-border')
    expect(tabFor('گزارش')).toHaveClass('border-transparent')
  })

  it('closes an inactive tab from its X button without leaving the open document', async () => {
    installBridge([storedDocument(1, 'یادداشت'), storedDocument(2, 'گزارش')])
    const user = userEvent.setup()

    const { router } = renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'یادداشت' }))
    await screen.findByRole('heading', { name: 'یادداشت' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۲)' })

    await user.click(screen.getByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    await closeTab(user, 'یادداشت')

    expect(tabTitles()).toEqual(['گزارش'])
    expect(screen.getByRole('heading', { name: 'گزارش' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/documents/2')
  })

  it('activates the tab that takes the place of a closed active tab', async () => {
    installBridge([
      storedDocument(1, 'یادداشت'),
      storedDocument(2, 'گزارش'),
      storedDocument(3, 'پیش نویس'),
    ])
    const user = userEvent.setup()

    const { router } = renderApp('/')
    for (const title of ['یادداشت', 'گزارش', 'پیش نویس']) {
      await user.click(await screen.findByRole('link', { name: title }))
      await screen.findByRole('heading', { name: title })
      await user.click(screen.getByRole('link', { name: 'خانه' }))
      await screen.findByRole('heading', { name: 'مستندات (۳)' })
    }

    await user.click(within(tabsStrip()).getByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    await closeTab(user, 'گزارش')

    expect(tabTitles()).toEqual(['یادداشت', 'پیش نویس'])
    expect(router.state.location.pathname).toBe('/documents/3')
    expect(
      await screen.findByRole('heading', { name: 'پیش نویس' }),
    ).toBeInTheDocument()

    await closeTab(user, 'پیش نویس')

    expect(tabTitles()).toEqual(['یادداشت'])
    expect(router.state.location.pathname).toBe('/documents/1')
    expect(
      await screen.findByRole('heading', { name: 'یادداشت' }),
    ).toBeInTheDocument()
  })

  it('returns to the documents list when the last open tab is closed', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const user = userEvent.setup()

    const { router } = renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    await closeTab(user, 'یادداشت')

    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(tabTitles()).toEqual([])
  })

  it('truncates a long document title inside its tab', async () => {
    const longTitle =
      'گزارش سالانه ی بسیار طولانی برای بررسی کوتاه شدن عنوان در نوار عنوان'
    installBridge([storedDocument(1, longTitle)])

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: longTitle })

    const tab = tabFor(longTitle)
    const link = tabLink(longTitle)
    expect(tab).toHaveClass('h-8', 'w-64')
    expect(link).toHaveClass('flex-auto', 'truncate', 'min-w-0')
    expect(link).toHaveTextContent(longTitle)
  })

  it('mutes the title of every tab that is not the open one', async () => {
    installBridge([storedDocument(1, 'یادداشت'), storedDocument(2, 'گزارش')])
    const user = userEvent.setup()

    renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'یادداشت' }))
    await screen.findByRole('heading', { name: 'یادداشت' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۲)' })

    await user.click(screen.getByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    expect(tabLink('گزارش')).toHaveClass('text-foreground')
    expect(tabLink('یادداشت')).toHaveClass('text-muted-foreground')

    await user.click(tabLink('یادداشت'))
    await screen.findByRole('heading', { name: 'یادداشت' })

    expect(tabLink('یادداشت')).toHaveClass('text-foreground')
    expect(tabLink('گزارش')).toHaveClass('text-muted-foreground')
  })

  it('un-mutes an inactive tab title while its tab is hovered', async () => {
    installBridge([storedDocument(1, 'یادداشت'), storedDocument(2, 'گزارش')])
    const user = userEvent.setup()

    renderApp('/')
    await user.click(await screen.findByRole('link', { name: 'یادداشت' }))
    await screen.findByRole('heading', { name: 'یادداشت' })

    await user.click(screen.getByRole('link', { name: 'خانه' }))
    await screen.findByRole('heading', { name: 'مستندات (۲)' })

    await user.click(screen.getByRole('link', { name: 'گزارش' }))
    await screen.findByRole('heading', { name: 'گزارش' })

    await user.hover(tabLink('یادداشت'))

    expect(tabFor('یادداشت')).toHaveClass('group')
    expect(tabLink('یادداشت')).toHaveClass(
      'text-muted-foreground',
      'group-hover:text-foreground',
    )
  })

  it('keeps the tab title in step with a renamed document', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const user = userEvent.setup()

    renderApp('/documents/1')
    await user.click(await screen.findByRole('heading', { name: 'یادداشت' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })
    await user.clear(input)
    await user.type(input, 'گزارش تازه')
    await user.tab()

    await screen.findByRole('heading', { name: 'گزارش تازه' })

    expect(tabTitles()).toEqual(['گزارش تازه'])
  })

  it('closes the tab of a document deleted from its page', async () => {
    installBridge([storedDocument(1, 'یادداشت'), storedDocument(2, 'گزارش')])
    const user = userEvent.setup()

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    await user.click(screen.getByRole('button', { name: 'گزینه ها' }))
    await user.click(await screen.findByRole('menuitem', { name: 'حذف' }))
    await user.click(await screen.findByRole('button', { name: 'بله' }))

    expect(await screen.findByText('سند حذف شد.')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۱)' }),
    ).toBeInTheDocument()
    expect(tabTitles()).toEqual([])
  })

  it('closes the tabs of every document removed in a batch delete', async () => {
    installBridge([
      storedDocument(1, 'یادداشت'),
      storedDocument(2, 'گزارش'),
      storedDocument(3, 'طرح'),
    ])
    const user = userEvent.setup()

    renderApp('/')
    for (const title of ['یادداشت', 'گزارش']) {
      await user.click(await screen.findByRole('link', { name: title }))
      await screen.findByRole('heading', { name: title })
      await user.click(screen.getByRole('link', { name: 'خانه' }))
      await screen.findByRole('heading', { name: 'مستندات (۳)' })
    }
    expect(tabTitles()).toEqual(['یادداشت', 'گزارش'])

    await user.click(screen.getByRole('button', { name: 'انتخاب گروهی اسناد' }))
    const bodyTable = screen.getAllByRole('table')[1]
    await user.click(
      within(bodyTable).getByRole('checkbox', { name: 'انتخاب سند یادداشت' }),
    )
    await user.click(
      within(bodyTable).getByRole('checkbox', { name: 'انتخاب سند گزارش' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۲)' }),
    )
    await user.click(await screen.findByRole('button', { name: 'بله' }))

    expect(await screen.findByText('۲ سند حذف شد.')).toBeInTheDocument()
    await vi.waitFor(() => expect(tabTitles()).toEqual([]))
  })

  it('glides the tab layout on the wheel and leaves a sideways wheel alone', async () => {
    installBridge([storedDocument(1, 'یادداشت')])

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 600,
      clientWidth: 200,
    })

    const wheelDown = new WheelEvent('wheel', { deltaY: 120, cancelable: true })
    const wheelUp = new WheelEvent('wheel', { deltaY: -120, cancelable: true })
    const wheelSideways = new WheelEvent('wheel', {
      deltaX: 120,
      cancelable: true,
    })

    await act(() => strip.dispatchEvent(wheelSideways))

    expect(wheelSideways.defaultPrevented).toBe(false)
    expect(scroll.scrollLeft()).toBe(0)

    await act(() => strip.dispatchEvent(wheelDown))

    expect(wheelDown.defaultPrevented).toBe(true)
    expect(scroll.scrollLeft()).toBeGreaterThan(-120)
    await vi.waitFor(() => expect(scroll.scrollLeft()).toBe(-120))

    await act(() => {
      strip.dispatchEvent(wheelDown)
      strip.dispatchEvent(wheelDown)
    })

    await vi.waitFor(() => expect(scroll.scrollLeft()).toBe(-360))

    await act(() => strip.dispatchEvent(wheelUp))

    await vi.waitFor(() => expect(scroll.scrollLeft()).toBe(-240))
    expect(strip).toHaveClass(
      'overflow-x-auto',
      '[scrollbar-width:none]',
      '[&::-webkit-scrollbar]:hidden',
    )
  })

  it('glides the tab layout on the arrow keys while the tab layout is hovered', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const user = userEvent.setup()

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 600,
      clientWidth: 200,
    })

    await user.hover(tabsArea())

    await act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })),
    )

    expect(scroll.scrollLeft()).toBeGreaterThan(-120)
    await vi.waitFor(() => expect(scroll.scrollLeft()).toBe(-120))

    await act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })),
    )

    await vi.waitFor(() => expect(scroll.scrollLeft()).toBe(0))

    await user.unhover(tabsArea())

    await act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })),
    )

    await new Promise((resolve) => {
      setTimeout(resolve, 50)
    })

    expect(scroll.scrollLeft()).toBe(0)
  })

  it('leaves the arrow keys to the title field while the tab layout is hovered', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const user = userEvent.setup()

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 600,
      clientWidth: 200,
    })

    await user.click(screen.getByRole('heading', { name: 'یادداشت' }))
    const input = await screen.findByRole('textbox', { name: 'عنوان سند' })

    await user.hover(tabsArea())
    await user.click(input)
    await user.keyboard('{ArrowLeft}')

    await new Promise((resolve) => {
      setTimeout(resolve, 50)
    })

    expect(scroll.scrollLeft()).toBe(0)
    expect(input).toHaveFocus()
  })

  it('shows a scroll button for each side the tab layout still hides, and hides it at that end', async () => {
    installBridge([storedDocument(1, 'یادداشت')])

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    expect(
      screen.queryByRole('button', { name: 'نمایش تب های بعدی' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'نمایش تب های قبلی' }),
    ).not.toBeInTheDocument()

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 600,
      clientWidth: 200,
    })

    await scroll.scrollTo(0)

    expect(
      await screen.findByRole('button', { name: 'نمایش تب های بعدی' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'نمایش تب های قبلی' }),
    ).not.toBeInTheDocument()

    await scroll.scrollTo(-1.5)

    expect(
      screen.getByRole('button', { name: 'نمایش تب های بعدی' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'نمایش تب های قبلی' }),
    ).not.toBeInTheDocument()

    await scroll.scrollTo(-200)

    expect(
      screen.getByRole('button', { name: 'نمایش تب های بعدی' })
        .nextElementSibling,
    ).toBe(strip)
    expect(
      screen.getByRole('button', { name: 'نمایش تب های قبلی' })
        .previousElementSibling,
    ).toBe(strip)

    await scroll.scrollTo(-398)

    expect(
      screen.queryByRole('button', { name: 'نمایش تب های بعدی' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'نمایش تب های قبلی' }),
    ).toBeInTheDocument()

    await scroll.scrollTo(-399.5)

    expect(
      screen.queryByRole('button', { name: 'نمایش تب های بعدی' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'نمایش تب های قبلی' }),
    ).toBeInTheDocument()

    await scroll.scrollTo(-400)

    expect(
      screen.queryByRole('button', { name: 'نمایش تب های بعدی' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'نمایش تب های قبلی' }),
    ).toBeInTheDocument()
  })

  it('hides both scroll buttons when the tab layout barely overflows', async () => {
    installBridge([storedDocument(1, 'یادداشت')])

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 601,
      clientWidth: 600,
    })

    await scroll.scrollTo(-1)

    expect(
      screen.queryByRole('button', { name: 'نمایش تب های بعدی' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'نمایش تب های قبلی' }),
    ).not.toBeInTheDocument()
  })

  it('stops gliding when the tab layout reaches an end it cannot pass', async () => {
    installBridge([storedDocument(1, 'یادداشت')])

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 600,
      clientWidth: 200,
      clamp: (value) => Math.max(value, -398.5),
    })

    await scroll.scrollTo(-398.5)

    await act(() =>
      strip.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 120, cancelable: true }),
      ),
    )

    await vi.waitFor(() => expect(scroll.writes()).toBeGreaterThan(0))

    const writes = scroll.writes()
    await new Promise((resolve) => {
      setTimeout(resolve, 100)
    })

    expect(scroll.writes()).toBe(writes)
    expect(scroll.scrollLeft()).toBe(-398.5)
  })

  it('glides the tab layout by one page when a scroll button is pressed', async () => {
    installBridge([storedDocument(1, 'یادداشت')])
    const user = userEvent.setup()

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 600,
      clientWidth: 200,
    })

    await scroll.scrollTo(-100)

    await user.click(screen.getByRole('button', { name: 'نمایش تب های بعدی' }))

    await vi.waitFor(() => expect(scroll.scrollLeft()).toBe(-300))

    await user.click(screen.getByRole('button', { name: 'نمایش تب های قبلی' }))

    await vi.waitFor(() => expect(scroll.scrollLeft()).toBe(-100))
  })

  it('styles both tab scroll buttons like the add button', async () => {
    installBridge([storedDocument(1, 'یادداشت')])

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: 'یادداشت' })

    const strip = tabsStrip()
    const scroll = stubStripScroll(strip, {
      scrollWidth: 600,
      clientWidth: 200,
    })

    await scroll.scrollTo(-200)

    const add = screen.getByRole('button', { name: 'افزودن سند' })
    expect(add).toHaveClass('size-8')

    for (const name of ['نمایش تب های بعدی', 'نمایش تب های قبلی']) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('data-variant', 'outline')
      expect(button).toHaveAttribute('data-size', 'icon')
      expect(button).toHaveClass('size-8')
    }
  })

  it('shows the full title in a tooltip only after the tab title is hovered for the delay', async () => {
    const longTitle = 'طرح بازنگری گزارش سالانه ی واحد پژوهش و برنامه ریزی'
    installBridge([storedDocument(1, longTitle)])
    const user = userEvent.setup()

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: longTitle })

    await user.hover(tabLink(longTitle))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    const tooltip = await screen.findByRole('tooltip', undefined, {
      timeout: 4000,
    })
    expect(tooltip).toHaveTextContent(longTitle)
    expect(tooltip).toHaveAttribute('data-side', 'bottom')
    expect(tooltip).toHaveAttribute('data-align', 'start')
  })

  it('keeps the tab title tooltip delay right after the add button tooltip was shown', async () => {
    const longTitle = 'طرح بازنگری گزارش سالانه ی واحد پژوهش و برنامه ریزی'
    installBridge([storedDocument(1, longTitle)])
    const user = userEvent.setup()

    renderApp('/documents/1')
    await screen.findByRole('heading', { name: longTitle })

    await user.hover(screen.getByRole('button', { name: 'افزودن سند' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('افزودن سند')

    await user.hover(tabLink(longTitle))

    expect(
      screen.queryByText(longTitle, {
        selector: '[data-slot="tooltip-content"]',
      }),
    ).not.toBeInTheDocument()

    expect(
      await screen.findByText(
        longTitle,
        { selector: '[data-slot="tooltip-content"]' },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument()
  })
})
