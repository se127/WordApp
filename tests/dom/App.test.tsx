import App from '@/App'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/query'
import { act, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

type WordAppBridge = Window['WordApp']

function installBridge() {
  window.WordApp = {
    platform: 'win32',
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
      delete: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    },
  } satisfies WordAppBridge
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
  // see each other's cached data. The toasts live outside React, in sonner's
  // own store; drop them the same way.
  queryClient.clear()
  toast.dismiss()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
  document.documentElement.classList.remove('dark')
  document.getElementById('app-loading')?.remove()
})

describe('App', () => {
  it('removes the pre-mount loading screen from index.html once mounted', async () => {
    installBridge()
    // index.html paints this screen while the bundle loads; App retires it.
    const loading = document.createElement('div')
    loading.id = 'app-loading'
    document.body.append(loading)

    renderApp()
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    expect(document.getElementById('app-loading')).toBeNull()
  })

  it('renders the theme picker, the content box, and the home page', async () => {
    installBridge()

    renderApp()

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

  it('hosts toasts at the bottom left, expanded, for eight seconds each', async () => {
    installBridge()

    renderApp()
    await screen.findByRole('heading', { name: 'مستندات (0)' })

    vi.useFakeTimers()
    try {
      act(() => {
        toast.error('افزودن سند ناموفق بود. دوباره تلاش کنید.')
      })
      // Sonner hands a new toast to the Toaster through a zero-delay timer
      // ("prevent batching, temp solution" in its source); run it so the
      // toast lands in the DOM.
      act(() => {
        vi.advanceTimersByTime(1)
      })

      // The toast host carries the app shell's choices (app-shell.tsx): the
      // bottom-left corner, the expanded layout, and the app's font.
      const toaster = document.querySelector('ol[data-sonner-toaster]')
      expect(toaster).toHaveAttribute('data-y-position', 'bottom')
      expect(toaster).toHaveAttribute('data-x-position', 'left')
      expect(toaster).toHaveClass('font-sans', 'pointer-events-auto')

      const toastItem = screen
        .getByText('افزودن سند ناموفق بود. دوباره تلاش کنید.')
        .closest('li')
      expect(toastItem).toHaveAttribute('data-expanded', 'true')
      expect(toastItem).toHaveAttribute('data-removed', 'false')

      // The toaster's 8-second duration: the toast is still there a moment
      // before the eighth second is up...
      act(() => {
        vi.advanceTimersByTime(7998)
      })
      expect(toastItem).toHaveAttribute('data-removed', 'false')

      // ...and marked for removal right at it (sonner's own default would
      // have dropped it after four).
      act(() => {
        vi.advanceTimersByTime(2)
      })
      expect(toastItem).toHaveAttribute('data-removed', 'true')
    } finally {
      act(() => {
        toast.dismiss()
      })
      vi.useRealTimers()
    }
  })

  it('mounts without the preload bridge', async () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderApp()

    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})
