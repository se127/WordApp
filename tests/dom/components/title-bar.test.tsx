import { TitleBar } from '@/components/title-bar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/lib/query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

type WindowControls = Window['WordApp']['windowControls']

const storedDocument = {
  id: 1,
  title: 'بدون عنوان',
  body: '',
  createdAt: 0,
  updatedAt: 0,
}

function installControls(
  overrides: Partial<WindowControls> = {},
  documentOverrides: Partial<Window['WordApp']['documents']> = {},
) {
  const controls: WindowControls = {
    minimize: vi.fn(async () => {}),
    toggleMaximize: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    isMaximized: vi.fn(async () => false),
    onMaximizedChange: vi.fn(() => () => {}),
    ...overrides,
  }

  window.WordApp = {
    platform: 'win32',
    documents: {
      create: vi.fn(async () => storedDocument),
      get: vi.fn(async () => storedDocument),
      count: vi.fn(async () => 0),
      list: vi.fn(async () => []),
      delete: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => undefined),
      save: vi.fn(async () => storedDocument),
      ...documentOverrides,
    },
    windowControls: controls,
  } satisfies Window['WordApp']

  return controls
}

async function renderTitleBar() {
  const rootRoute = createRootRoute({ component: TitleBar })
  const documentRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/documents/$documentId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([documentRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const result = render(
    <TooltipProvider>
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TooltipProvider>,
  )

  await screen.findByText('WordApp')

  return { router, ...result }
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('TitleBar', () => {
  it('writes the app name in the left group right after the theme picker', async () => {
    installControls()

    await renderTitleBar()

    const name = screen.getByText('WordApp')
    const bar = name.closest('div[dir="ltr"]')
    expect(bar).toHaveClass('flex', 'h-16', 'items-center')
    expect(name).toHaveClass(
      'text-sm',
      'font-medium',
      'text-black',
      'dark:text-white',
    )
    expect(name).not.toHaveClass('absolute')

    const picker = screen.getByRole('button', { name: 'تغییر پوسته' })
    expect(name.previousElementSibling).toBe(picker)
    expect(name.parentElement).toBe(bar?.firstElementChild)
    expect(name.parentElement).toHaveClass('no-drag-region', 'ps-4')
  })

  it('holds the document tabs between the app name and the home link, scrolling without a scrollbar', async () => {
    installControls()

    await renderTitleBar()

    const name = screen.getByText('WordApp')
    const home = screen.getByRole('link', { name: 'خانه' })
    const strip = document.querySelector<HTMLElement>(
      '[data-slot="document-tabs"]',
    )
    if (!strip) {
      throw new Error('the title bar is missing its document tabs strip')
    }

    const tabsArea = strip.parentElement
    expect(tabsArea).toHaveClass('min-w-0', 'flex-1', 'no-drag-region')
    expect(tabsArea?.previousElementSibling).toBe(name.parentElement)
    expect(tabsArea?.nextElementSibling).toBe(home.parentElement)
    expect(name.parentElement).toHaveClass('shrink-0')
    expect(home.parentElement).toHaveClass('shrink-0')

    expect(strip).toHaveAttribute('dir', 'rtl')
    expect(strip).toHaveClass(
      'overflow-x-auto',
      '[scrollbar-width:none]',
      '[&::-webkit-scrollbar]:hidden',
    )
    expect(strip).toBeEmptyDOMElement()
  })

  it('hosts the theme picker at the left edge, inset like the content box', async () => {
    installControls()

    await renderTitleBar()

    const bar = screen.getByText('WordApp').closest('div[dir="ltr"]')
    const picker = within(bar as HTMLElement).getByRole('button', {
      name: 'تغییر پوسته',
    })

    expect(picker.parentElement).toBe(bar?.firstElementChild)
    expect(picker.parentElement).toHaveClass('no-drag-region', 'ps-4')
  })

  it('sizes every window button to the full bar height with the normal cursor', async () => {
    installControls()

    await renderTitleBar()

    for (const label of ['کوچک کردن', 'تمام صفحه', 'بستن']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass(
        'h-full',
        'w-12',
        'cursor-default',
      )
    }
  })

  it('offers an outline icon home link before the window controls, spaced and with a tooltip', async () => {
    installControls()
    const user = userEvent.setup()

    await renderTitleBar()

    const home = screen.getByRole('link', { name: 'خانه' })
    expect(home).toHaveAttribute('data-variant', 'outline')
    expect(home).toHaveAttribute('data-size', 'icon')
    expect(home).toHaveClass('no-drag-region', 'me-3')
    expect(home.querySelector('svg')).toHaveClass('lucide-house')

    const minimize = screen.getByRole('button', { name: 'کوچک کردن' })
    expect(home.nextElementSibling).toBe(minimize)
    expect(home.parentElement).toBe(minimize.parentElement)

    await user.hover(home)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('خانه')
  })

  it('offers an add icon button for a new document right after the tabs area, with a tooltip', async () => {
    installControls()
    const user = userEvent.setup()

    await renderTitleBar()

    const strip = document.querySelector('[data-slot="document-tabs"]')
    const add = screen.getByRole('button', { name: 'افزودن سند' })
    expect(add).toHaveAttribute('data-variant', 'outline')
    expect(add).toHaveAttribute('data-size', 'icon')
    expect(add).toHaveClass('no-drag-region', 'me-3')
    expect(add.querySelector('svg')).toHaveClass('lucide-plus')
    expect(add.parentElement).toBe(strip?.parentElement?.nextElementSibling)
    expect(add.parentElement?.firstElementChild).toBe(add)
    expect(add.nextElementSibling).toHaveAttribute('data-slot', 'separator')

    await user.hover(add)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('افزودن سند')
  })

  it('holds a vertical separator between the add button and the home link', async () => {
    installControls()

    await renderTitleBar()

    const add = screen.getByRole('button', { name: 'افزودن سند' })
    const separator = add.nextElementSibling
    expect(separator).toHaveAttribute('data-slot', 'separator')
    expect(separator).toHaveAttribute('data-orientation', 'vertical')
    expect(separator).toHaveClass('me-3', 'my-auto', 'h-8')
    expect(separator?.nextElementSibling).toBe(
      screen.getByRole('link', { name: 'خانه' }),
    )
  })

  it('creates a document from the add button and keeps it busy until the write lands', async () => {
    let finishCreate!: (document: typeof storedDocument) => void
    const create = vi.fn(
      () =>
        new Promise<typeof storedDocument>((resolve) => {
          finishCreate = resolve
        }),
    )
    installControls({}, { create })
    const user = userEvent.setup()

    const { router } = await renderTitleBar()

    await user.click(screen.getByRole('button', { name: 'افزودن سند' }))

    expect(create).toHaveBeenCalledOnce()
    const busy = screen.getByRole('button', { name: 'در حال ساخت سند...' })
    expect(busy).toBeDisabled()
    expect(busy.querySelector('svg')).toHaveClass(
      'lucide-loader-circle',
      'size-4',
      'animate-spin',
    )

    await act(() => finishCreate(storedDocument))

    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/documents/1'),
    )
    expect(screen.getByRole('button', { name: 'افزودن سند' })).toBeEnabled()
  })

  it('starts from the bridge maximize state and flips to restore', async () => {
    installControls({ isMaximized: vi.fn(async () => true) })

    await renderTitleBar()

    expect(
      await screen.findByRole('button', { name: 'بازگرداندن' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'تمام صفحه' }),
    ).not.toBeInTheDocument()
  })

  it('flips between maximize and restore on the bridge change events', async () => {
    let emitMaximizedChange: ((isMaximized: boolean) => void) | undefined
    installControls({
      onMaximizedChange: vi.fn((callback: (isMaximized: boolean) => void) => {
        emitMaximizedChange = callback
        return () => {}
      }),
    })

    await renderTitleBar()
    const maximize = await screen.findByRole('button', { name: 'تمام صفحه' })
    expect(maximize.querySelector('svg')).toHaveClass('lucide-square')

    act(() => emitMaximizedChange?.(true))
    expect(
      screen.getByRole('button', { name: 'بازگرداندن' }).querySelector('svg'),
    ).toHaveClass('lucide-copy', 'rotate-90')

    act(() => emitMaximizedChange?.(false))
    expect(
      screen.getByRole('button', { name: 'تمام صفحه' }),
    ).toBeInTheDocument()
  })

  it('runs minimize, maximize, and close through the bridge on click', async () => {
    const controls = installControls()
    const user = userEvent.setup()

    await renderTitleBar()

    await user.click(screen.getByRole('button', { name: 'کوچک کردن' }))
    expect(controls.minimize).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'تمام صفحه' }))
    expect(controls.toggleMaximize).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'بستن' }))
    expect(controls.close).toHaveBeenCalledOnce()
  })

  it('explains its buttons with tooltips', async () => {
    installControls()
    const user = userEvent.setup()

    await renderTitleBar()

    await user.hover(screen.getByRole('button', { name: 'کوچک کردن' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('کوچک کردن')
  })

  it('stops listening for maximize changes once unmounted', async () => {
    const unsubscribe = vi.fn()
    installControls({
      onMaximizedChange: vi.fn(() => unsubscribe),
    })

    const { unmount } = await renderTitleBar()
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('still renders and answers clicks without the preload bridge', async () => {
    const user = userEvent.setup()

    await renderTitleBar()

    await user.click(screen.getByRole('button', { name: 'کوچک کردن' }))
    await user.click(screen.getByRole('button', { name: 'تمام صفحه' }))
    await user.click(screen.getByRole('button', { name: 'بستن' }))

    expect(screen.getByText('WordApp')).toBeInTheDocument()
  })
})
