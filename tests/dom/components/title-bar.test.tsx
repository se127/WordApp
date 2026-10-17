import { TitleBar } from '@/components/title-bar'
import { TooltipProvider } from '@/components/ui/tooltip'
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

function installControls(overrides: Partial<WindowControls> = {}) {
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
      save: vi.fn(async () => storedDocument),
    },
    windowControls: controls,
  } satisfies Window['WordApp']

  return controls
}

const renderTitleBar = () =>
  render(
    <TooltipProvider>
      <TitleBar />
    </TooltipProvider>,
  )

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('TitleBar', () => {
  it('centers the black-and-white app name in the bar', () => {
    installControls()

    renderTitleBar()

    const name = screen.getByText('WordApp')
    const bar = name.closest('div[dir="ltr"]')
    expect(bar).toHaveClass('relative', 'flex', 'h-12', 'items-center')
    expect(name).toHaveClass(
      'absolute',
      'left-1/2',
      '-translate-x-1/2',
      'text-black',
      'dark:text-white',
    )
  })

  it('hosts the theme picker at the left edge, inset like the content box', () => {
    installControls()

    renderTitleBar()

    const bar = screen.getByText('WordApp').closest('div[dir="ltr"]')
    const picker = within(bar as HTMLElement).getByRole('button', {
      name: 'تغییر پوسته',
    })

    expect(picker.parentElement).toBe(bar?.firstElementChild)
    expect(picker.parentElement).toHaveClass('no-drag-region', 'ps-4')
  })

  it('sizes every window button to the full bar height with the normal cursor', () => {
    installControls()

    renderTitleBar()

    for (const label of ['کوچک کردن', 'تمام صفحه', 'بستن']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass(
        'h-full',
        'w-12',
        'cursor-default',
      )
    }
  })

  it('starts from the bridge maximize state and flips to restore', async () => {
    installControls({ isMaximized: vi.fn(async () => true) })

    renderTitleBar()

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

    renderTitleBar()
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

    renderTitleBar()

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

    renderTitleBar()

    await user.hover(screen.getByRole('button', { name: 'کوچک کردن' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('کوچک کردن')
  })

  it('stops listening for maximize changes once unmounted', () => {
    const unsubscribe = vi.fn()
    installControls({
      onMaximizedChange: vi.fn(() => unsubscribe),
    })

    const { unmount } = renderTitleBar()
    unmount()

    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('still renders and answers clicks without the preload bridge', async () => {
    const user = userEvent.setup()

    renderTitleBar()

    await user.click(screen.getByRole('button', { name: 'کوچک کردن' }))
    await user.click(screen.getByRole('button', { name: 'تمام صفحه' }))
    await user.click(screen.getByRole('button', { name: 'بستن' }))

    expect(screen.getByText('WordApp')).toBeInTheDocument()
  })
})
