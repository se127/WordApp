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
    images: {
      save: vi.fn(async () => ({
        src: 'wordapp-image://image/11111111-1111-4111-8111-111111111111.png',
      })),
      copy: vi.fn(async () => ({
        src: 'wordapp-image://image/33333333-3333-4333-8333-333333333333.png',
      })),
      remove: vi.fn(async () => new ArrayBuffer(3)),
      restore: vi.fn(async (request: { src: string }) => ({
        src: request.src,
      })),
      reconcile: vi.fn(async () => {}),
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

  it('puts the home heading on the title row before the theme picker', async () => {
    installBridge()

    renderApp()

    const heading = await screen.findByRole('heading', {
      name: 'مستندات (۰)',
    })
    const bar = document.querySelector<HTMLElement>('[data-slot="title-bar"]')
    if (bar === null) {
      throw new Error('the title bar is missing')
    }
    const picker = screen.getByRole('button', { name: 'تغییر پوسته' })
    const addButton = screen.getByRole('button', { name: 'افزودن سند' })

    expect(bar).toHaveClass('relative', 'flex', 'w-full', 'items-center')
    expect(bar).not.toHaveClass('absolute', 'pointer-events-none')
    expect(bar).toContainElement(heading)
    expect(bar.firstElementChild).toContainElement(heading)
    expect(bar.lastElementChild).toContainElement(picker)
    expect(screen.getByRole('main')).toContainElement(bar)
    expect(addButton.previousElementSibling).toBe(bar)
  })

  it('renders the content box flat and transparent on the page background', async () => {
    installBridge()

    renderApp()

    const main = await screen.findByRole('main')
    expect(main).toHaveClass('min-h-0', 'flex-1')
    expect(main).not.toHaveClass('mx-4')
    expect(main).not.toHaveClass('mb-4')
    expect(main).not.toHaveClass('rounded-lg')
    expect(main).not.toHaveClass('border')
    expect(main).not.toHaveClass('bg-white')
    expect(main).not.toHaveClass('dark:bg-zinc-800')
    expect(main.parentElement).toHaveClass(
      'bg-white',
      'dark:bg-zinc-900',
      'p-6',
    )
  })

  it('uses the neutral shadcn palette for the primary color in both themes', async () => {
    const styles = await readFile('src/index.css', 'utf8')

    expect(styles).toMatch(/:root \{[\s\S]*?--primary: oklch\(0\.205 0 0\);/)
    expect(styles).toMatch(/\.dark \{[\s\S]*?--primary: oklch\(0\.922 0 0\);/)
    expect(styles).not.toContain('oklch(0.508 0.118 165.612)')
    expect(styles).not.toContain('oklch(0.432 0.095 166.913)')
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

  it('shows the default cursor over scroll areas', async () => {
    const styles = await readFile('src/index.css', 'utf8')

    expect(styles).toMatch(
      /\[data-slot='scroll-area-scrollbar'\],\s*\[data-slot='scroll-area-thumb'\]\s*\{[^}]*cursor: default;/,
    )
    expect(styles).toMatch(
      /\[data-slot='scroll-area'\]:has\(\[data-slot='scroll-area-thumb'\]:active\)\s*\{[^}]*cursor: default;/,
    )
  })

  it('mounts without the preload bridge', async () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderApp()

    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})
