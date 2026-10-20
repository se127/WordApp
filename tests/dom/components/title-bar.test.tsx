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

const storedDocument = {
  id: 1,
  title: 'بدون عنوان',
  body: '',
  createdAt: 0,
  updatedAt: 0,
}

function installBridge(
  documentOverrides: Partial<Window['WordApp']['documents']> = {},
) {
  window.WordApp = {
    platform: 'win32',
    documents: {
      create: vi.fn(async () => storedDocument),
      get: vi.fn(async () => storedDocument),
      count: vi.fn(async () => 0),
      list: vi.fn(async () => []),
      cancel: vi.fn(),
      delete: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => undefined),
      save: vi.fn(async () => storedDocument),
      ...documentOverrides,
    },
  } satisfies Window['WordApp']
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

  await screen.findByRole('button', { name: 'تغییر پوسته' })

  return { router, ...result }
}

function titleBar(): HTMLElement {
  const bar = document.querySelector<HTMLElement>('[data-slot="title-bar"]')
  if (!bar) {
    throw new Error('the title bar is missing')
  }
  return bar
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('TitleBar', () => {
  it('leaves the app title to the native title bar', async () => {
    installBridge()

    await renderTitleBar()

    expect(titleBar()).toHaveClass(
      'flex',
      'h-16',
      'items-center',
      'select-none',
    )
    expect(screen.queryByText('WordApp')).toBeNull()
  })

  it('holds the document tabs between the theme picker and the home link, scrolling without a scrollbar', async () => {
    installBridge()

    await renderTitleBar()

    const home = screen.getByRole('link', { name: 'خانه' })
    const strip = document.querySelector<HTMLElement>(
      '[data-slot="document-tabs"]',
    )
    if (!strip) {
      throw new Error('the title bar is missing its document tabs strip')
    }

    const tabsArea = strip.parentElement
    expect(tabsArea).toHaveClass('min-w-0', 'flex-1')
    expect(tabsArea?.previousElementSibling).toBe(titleBar().firstElementChild)
    expect(tabsArea?.nextElementSibling).toBe(home.parentElement)
    expect(tabsArea?.previousElementSibling).toHaveClass('shrink-0')
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
    installBridge()

    await renderTitleBar()

    const bar = titleBar()
    const picker = within(bar).getByRole('button', {
      name: 'تغییر پوسته',
    })

    expect(picker.parentElement).toBe(bar?.firstElementChild)
    expect(picker.parentElement).toHaveClass('ps-4')
  })

  it('leaves the window controls to the native title bar', async () => {
    installBridge()

    await renderTitleBar()

    for (const label of ['کوچک کردن', 'تمام صفحه', 'بستن']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })

  it('offers an outline icon home link, spaced and with a tooltip', async () => {
    installBridge()
    const user = userEvent.setup()

    await renderTitleBar()

    const home = screen.getByRole('link', { name: 'خانه' })
    expect(home).toHaveAttribute('data-variant', 'outline')
    expect(home).toHaveAttribute('data-size', 'icon')
    expect(home.querySelector('svg')).toHaveClass('lucide-house')
    expect(home.parentElement).toHaveClass('justify-end', 'pe-4')

    await user.hover(home)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('خانه')
  })

  it('offers an add icon button for a new document right after the tabs area, with a tooltip', async () => {
    installBridge()
    const user = userEvent.setup()

    await renderTitleBar()

    const strip = document.querySelector('[data-slot="document-tabs"]')
    const add = screen.getByRole('button', { name: 'افزودن سند' })
    expect(add).toHaveAttribute('data-variant', 'outline')
    expect(add).toHaveAttribute('data-size', 'icon')
    expect(add).toHaveClass('me-3')
    expect(add.querySelector('svg')).toHaveClass('lucide-plus')
    expect(add.parentElement).toBe(strip?.parentElement?.nextElementSibling)
    expect(add.parentElement?.firstElementChild).toBe(add)
    expect(add.nextElementSibling).toHaveAttribute('data-slot', 'separator')

    await user.hover(add)

    expect(await screen.findByRole('tooltip')).toHaveTextContent('افزودن سند')
  })

  it('holds a vertical separator between the add button and the home link', async () => {
    installBridge()

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
    installBridge({ create })
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

  it('still renders without the preload bridge', async () => {
    await renderTitleBar()

    expect(titleBar()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'افزودن سند' })).toBeEnabled()
  })
})
