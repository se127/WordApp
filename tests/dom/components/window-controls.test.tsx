import { WindowControls } from '@/components/window-controls'
import { TooltipProvider } from '@/components/ui/tooltip'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'

// `window.WordApp` is the preload bridge (src/types/global.d.ts); every test
// installs its own stub of it and observes what the buttons send.
type WordAppBridge = Window['WordApp']

let changeListeners: Array<(maximized: boolean) => void>
let unsubscribe: Mock<() => void>

function installBridge({ maximized = false } = {}) {
  changeListeners = []
  unsubscribe = vi.fn<() => void>()

  const controls: WordAppBridge['windowControls'] = {
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    isMaximized: vi.fn(async () => maximized),
    onMaximizedChange: vi.fn((listener: (maximized: boolean) => void) => {
      changeListeners.push(listener)
      return unsubscribe
    }),
  }

  window.WordApp = {
    platform: 'win32',
    ready: vi.fn(),
    windowControls: controls,
    documents: { create: vi.fn(), get: vi.fn(), count: vi.fn() },
  }

  return controls
}

const renderControls = () =>
  render(
    <TooltipProvider>
      <WindowControls />
    </TooltipProvider>,
  )

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('WindowControls', () => {
  it('renders the three caption buttons with their Farsi labels', () => {
    installBridge()

    renderControls()

    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'تمام صفحه' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'کوچک کردن' }),
    ).toBeInTheDocument()
  })

  it('sends each caption action to the main process', async () => {
    const user = userEvent.setup()
    const controls = installBridge()

    renderControls()

    await user.click(screen.getByRole('button', { name: 'بستن' }))
    await user.click(screen.getByRole('button', { name: 'کوچک کردن' }))
    await user.click(screen.getByRole('button', { name: 'تمام صفحه' }))

    expect(controls.close).toHaveBeenCalledOnce()
    expect(controls.minimize).toHaveBeenCalledOnce()
    expect(controls.toggleMaximize).toHaveBeenCalledOnce()
  })

  it('shows the restore label while maximized and follows main-process changes', async () => {
    const controls = installBridge({ maximized: true })

    renderControls()
    await act(async () => {})

    expect(
      await screen.findByRole('button', { name: 'بازگرداندن' }),
    ).toBeInTheDocument()
    expect(controls.onMaximizedChange).toHaveBeenCalledOnce()
    expect(controls.isMaximized).toHaveBeenCalledOnce()

    act(() => {
      for (const listener of changeListeners) {
        listener(false)
      }
    })
    expect(
      await screen.findByRole('button', { name: 'تمام صفحه' }),
    ).toBeInTheDocument()
  })

  it('unsubscribes from main-process changes on unmount', () => {
    installBridge()

    const { unmount } = renderControls()
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('renders without the preload bridge and stays inert', async () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderControls()

    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'بستن' }))
  })

  it('reveals the Farsi tooltip on hover', async () => {
    const user = userEvent.setup()
    installBridge()

    renderControls()
    await user.hover(screen.getByRole('button', { name: 'بستن' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('بستن')
  })
})
