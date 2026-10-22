import App from '@/App'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/query'
import { act, render, screen, within } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

type WordAppBridge = Window['WordApp']

function installBridge() {
  window.WordApp = {
    platform: 'win32',
    lifecycle: {
      onBeforeClose: vi.fn(() => () => {}),
      closeReady: vi.fn(),
      closeCancelled: vi.fn(),
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
      list: vi.fn(async () => []),
      cancel: vi.fn(),
      delete: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => undefined),
      save: vi.fn(async () => undefined),
    },
  } satisfies WordAppBridge
}

const renderApp = () =>
  render(
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </DirectionProvider>,
  )

afterEach(() => {
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
    const loading = document.createElement('div')
    loading.id = 'app-loading'
    document.body.append(loading)

    renderApp()
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    expect(document.getElementById('app-loading')).toBeNull()
  })

  it('renders the title bar, the theme picker, the content box, and the home page', async () => {
    installBridge()

    renderApp()

    expect(
      await screen.findByRole('button', { name: 'تغییر پوسته' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'بستن' })).toBeNull()
    expect(await screen.findByRole('main')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'مستندات (۰)' }),
    ).toBeInTheDocument()
    expect(
      await within(screen.getByRole('main')).findByRole('button', {
        name: 'افزودن سند',
      }),
    ).toBeInTheDocument()
  })

  it('hosts toasts at the bottom left, expanded, for eight seconds each', async () => {
    installBridge()

    renderApp()
    await screen.findByRole('heading', { name: 'مستندات (۰)' })

    vi.useFakeTimers()
    try {
      act(() => {
        toast.error('افزودن سند ناموفق بود. دوباره تلاش کنید.')
      })
      act(() => {
        vi.advanceTimersByTime(1)
      })

      const toaster = document.querySelector('ol[data-sonner-toaster]')
      expect(toaster).toHaveAttribute('data-y-position', 'bottom')
      expect(toaster).toHaveAttribute('data-x-position', 'left')
      expect(toaster).toHaveClass('font-sans', 'pointer-events-auto')

      const toastItem = screen
        .getByText('افزودن سند ناموفق بود. دوباره تلاش کنید.')
        .closest('li')
      expect(toastItem).toHaveAttribute('data-expanded', 'true')
      expect(toastItem).toHaveAttribute('data-removed', 'false')

      act(() => {
        vi.advanceTimersByTime(7998)
      })
      expect(toastItem).toHaveAttribute('data-removed', 'false')

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

  it('keeps the toast icon on the first line and lets later lines span the full width', async () => {
    const styles = await readFile('src/index.css', 'utf8')

    expect(styles).toMatch(
      /\[data-sonner-toast\]\s*\{[^}]*display: flow-root !important;/,
    )
    expect(styles).toMatch(
      /\[data-sonner-toast\] \[data-icon\]\s*\{[^}]*float: inline-start;[^}]*margin-top:\s*calc\(\(1\.5em - 1rem\) \/ 2\);[^}]*margin-inline-end: 10px !important;/,
    )
    expect(styles).toMatch(
      /\[data-sonner-toast\] \[data-content\]\s*\{[^}]*display: block !important;/,
    )
    expect(styles).toMatch(
      /\[data-sonner-toast\] \[data-description\]\s*\{[^}]*clear: both;[^}]*margin-top: 2px;/,
    )
  })

  it('mounts without the preload bridge', async () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderApp()

    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})
