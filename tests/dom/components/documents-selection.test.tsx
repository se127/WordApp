import { DocumentsSelectionToolbar } from '@/components/documents-selection'
import { DirectionProvider } from '@/components/ui/direction'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/lib/query'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const storedDocument = {
  id: 1,
  title: 'بدون عنوان',
  body: '',
  createdAt: 0,
  updatedAt: 0,
}

function renderToolbar({
  isSelecting,
  selectedCount,
  isDisabled = false,
}: {
  isSelecting: boolean
  selectedCount: number
  isDisabled?: boolean
}) {
  const selectedIds = new Set(
    Array.from({ length: selectedCount }, (_, index) => index + 1),
  )
  const removeMany = vi.fn(async () => undefined)
  const onToggleSelecting = vi.fn()
  const onDocumentsDeleted = vi.fn()

  window.WordApp = {
    platform: 'win32',
    lifecycle: {
      onBeforeClose: vi.fn(() => () => {}),
      closeReady: vi.fn(),
      closeCancelled: vi.fn(),
    },
    documents: {
      create: vi.fn(async () => storedDocument),
      get: vi.fn(async () => undefined),
      count: vi.fn(async () => 0),
      list: vi.fn(async () => []),
      cancel: vi.fn(),
      delete: vi.fn(async () => undefined),
      deleteMany: removeMany,
      save: vi.fn(async () => undefined),
    },
  } satisfies Window['WordApp']

  render(
    <DirectionProvider dir="rtl">
      <TooltipProvider>
        <QueryClientProvider client={createQueryClient()}>
          <DocumentsSelectionToolbar
            isSelecting={isSelecting}
            selectedIds={selectedIds}
            onToggleSelecting={onToggleSelecting}
            onDocumentsDeleted={onDocumentsDeleted}
            isDisabled={isDisabled}
          />
          <Toaster position="bottom-left" duration={8000} expand />
        </QueryClientProvider>
      </TooltipProvider>
    </DirectionProvider>,
  )

  return { selectedIds, removeMany, onToggleSelecting, onDocumentsDeleted }
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'WordApp')
})

describe('DocumentsSelectionToolbar', () => {
  it('groups a four-digit selection count in the button, the dialog, and the toast', async () => {
    const { selectedIds, removeMany, onToggleSelecting, onDocumentsDeleted } =
      renderToolbar({ isSelecting: true, selectedCount: 1000 })
    const user = userEvent.setup()

    const toggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    expect(toggle).toHaveAttribute('data-variant', 'outline')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle.querySelector('svg')).toHaveClass('text-sidebar-primary')

    await user.click(
      screen.getByRole('button', { name: 'حذف اسناد انتخاب شده (۱٬۰۰۰)' }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        'آیا مطمئن هستید که می خواهید ۱٬۰۰۰ سند انتخاب شده را حذف کنید؟',
      ),
    ).toBeInTheDocument()
    expect(onToggleSelecting).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'بله' }))

    expect(removeMany).toHaveBeenCalledExactlyOnceWith([...selectedIds])
    expect(onDocumentsDeleted).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('۱٬۰۰۰ سند حذف شد.')).toBeInTheDocument()
  })

  it('shows the group selection tooltip while selection is inactive', async () => {
    renderToolbar({ isSelecting: false, selectedCount: 0 })
    const user = userEvent.setup()

    await user.hover(screen.getByRole('button', { name: 'انتخاب گروهی اسناد' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'انتخاب گروهی اسناد',
    )
  })

  it('shows the cancel selection tooltip while selection is active', async () => {
    renderToolbar({ isSelecting: true, selectedCount: 0 })
    const user = userEvent.setup()

    await user.hover(screen.getByRole('button', { name: 'انتخاب گروهی اسناد' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'لغو انتخاب گروهی',
    )
  })

  it('hides the destructive button and reports the toggle press while nothing is selected', async () => {
    const { onToggleSelecting, onDocumentsDeleted } = renderToolbar({
      isSelecting: false,
      selectedCount: 0,
    })
    const user = userEvent.setup()

    const toggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    expect(toggle).toHaveAttribute('data-variant', 'outline')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.querySelector('svg')).not.toHaveClass('text-sidebar-primary')
    expect(
      screen.queryByRole('button', { name: /^حذف اسناد انتخاب شده/ }),
    ).not.toBeInTheDocument()

    await user.click(toggle)

    expect(onToggleSelecting).toHaveBeenCalledTimes(1)
    expect(onDocumentsDeleted).not.toHaveBeenCalled()
  })

  it('disables the selection toggle while the table is loading', async () => {
    const { onToggleSelecting } = renderToolbar({
      isSelecting: false,
      selectedCount: 0,
      isDisabled: true,
    })
    const user = userEvent.setup()

    const toggle = screen.getByRole('button', {
      name: 'انتخاب گروهی اسناد',
    })
    expect(toggle).toBeDisabled()

    await user.click(toggle)

    expect(onToggleSelecting).not.toHaveBeenCalled()
  })
})
