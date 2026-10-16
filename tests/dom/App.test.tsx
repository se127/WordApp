import App from '@/App'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
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
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
  document.documentElement.classList.remove('dark')
})

describe('App', () => {
  it('asks the main process to reveal the window once mounted', () => {
    const { ready } = installBridge()

    renderApp()

    expect(ready).toHaveBeenCalledOnce()
  })

  it('renders the caption buttons, the theme picker, and the content box', () => {
    installBridge()

    renderApp()

    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'تغییر پوسته' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('mounts without the preload bridge', () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderApp()

    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
