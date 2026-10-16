import App from '@/App'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type WordAppBridge = Window['WordApp']

function installBridge() {
  const ready = vi.fn()

  window.WordApp = {
    platform: 'win32',
    ready,
    windowControls: {
      close: vi.fn(),
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      isMaximized: vi.fn(async () => false),
      onMaximizedChange: vi.fn(() => vi.fn()),
    },
    documents: {
      create: vi.fn(async () => ({
        id: 1,
        title: 'بدون عنوان',
        body: '',
        createdAt: 0,
        updatedAt: 0,
      })),
      get: vi.fn(async () => undefined),
      count: vi.fn(async () => 0),
    },
  } satisfies WordAppBridge

  return { ready }
}

// Mirrors the provider stack from src/main.tsx.
const renderApp = () =>
  render(
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </DirectionProvider>,
  )

afterEach(() => {
  // App renders with the module-level QueryClient; clear it so tests do not
  // see each other's cached data.
  queryClient.clear()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
  document.documentElement.classList.remove('dark')
})

describe('App', () => {
  it('asks the main process to reveal the window once mounted', async () => {
    const { ready } = installBridge()

    renderApp()
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    expect(ready).toHaveBeenCalledOnce()
  })

  it('renders the caption buttons, the theme picker, the content box, and the home page', async () => {
    installBridge()

    renderApp()

    expect(
      await screen.findByRole('button', { name: 'بستن' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'تغییر پوسته' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('main')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (0)' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'افزودن سند' }),
    ).toBeInTheDocument()
  })

  it('mounts without the preload bridge', async () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderApp()

    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})
