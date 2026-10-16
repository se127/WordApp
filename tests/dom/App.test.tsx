import App from '@/App'
import { DirectionProvider } from '@/components/ui/direction'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/query'
import { render, screen } from '@testing-library/react'
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
  // see each other's cached data.
  queryClient.clear()
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

  it('mounts without the preload bridge', async () => {
    Reflect.deleteProperty(window, 'WordApp')

    renderApp()

    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})
