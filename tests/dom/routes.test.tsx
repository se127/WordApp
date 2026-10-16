import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createAppRouter } from '@/router'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
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
// `count` reports what `create` stored, the way the database would.
function installBridge() {
  let storedCount = 0
  const create = vi.fn(async () => {
    storedCount += 1
    return storedDocument
  })
  const get = vi.fn(async () => storedDocument)
  const count = vi.fn(async () => storedCount)

  window.WordApp = {
    platform: 'win32',
    ready: vi.fn(),
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

// Mirrors the provider stack from src/main.tsx, over a router that starts at
// the given entry instead of the real hash history.
function renderRoute(initialEntry: string) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [initialEntry] }),
  )

  render(
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <RouterProvider router={router} />
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

  it('reads the document and the count fresh on every visit (stale time zero)', async () => {
    const { get, count } = installBridge()
    const user = userEvent.setup()

    renderRoute('/')
    await user.click(await screen.findByRole('button', { name: 'افزودن سند' }))
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    await user.click(screen.getByRole('link', { name: 'بازگشت به مستندات' }))
    await screen.findByRole('heading', { name: 'مستندات (1)' })

    await user.click(await screen.findByRole('button', { name: 'افزودن سند' }))
    await screen.findByRole('heading', { name: 'بدون عنوان' })

    expect(get).toHaveBeenCalledTimes(2)
    expect(count).toHaveBeenCalledTimes(2)
  })
})
