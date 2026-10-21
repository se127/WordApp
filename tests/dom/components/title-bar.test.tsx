import { TitleBar } from '@/components/title-bar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function renderTitleBar() {
  return render(
    <TooltipProvider>
      <TitleBar />
    </TooltipProvider>,
  )
}

function titleBar(): HTMLElement {
  const bar = document.querySelector<HTMLElement>('[data-slot="title-bar"]')
  if (!bar) {
    throw new Error('the title bar is missing')
  }
  return bar
}

describe('TitleBar', () => {
  it('leaves the app title to the native title bar', () => {
    renderTitleBar()

    expect(titleBar()).toHaveClass(
      'flex',
      'h-16',
      'items-center',
      'select-none',
    )
    expect(screen.queryByText('WordApp')).toBeNull()
  })

  it('hosts the theme picker at the left edge, inset like the content box', () => {
    renderTitleBar()

    const bar = titleBar()
    const picker = within(bar).getByRole('button', {
      name: 'تغییر پوسته',
    })

    expect(picker.parentElement).toBe(bar.firstElementChild)
    expect(picker.parentElement).toHaveClass('ps-4')
  })

  it('places trailing content at the right edge', () => {
    render(
      <TooltipProvider>
        <TitleBar trailing={<span>بازگشت به مستندات</span>} />
      </TooltipProvider>,
    )

    const bar = titleBar()
    const trailing = within(bar).getByText('بازگشت به مستندات').parentElement

    expect(bar).toHaveClass('justify-between')
    expect(trailing).toBe(bar.lastElementChild)
    expect(trailing).toHaveClass('pe-4')
  })

  it('holds no document tabs, add button, or home link', () => {
    renderTitleBar()

    expect(document.querySelector('[data-slot="document-tabs"]')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'افزودن سند' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'خانه' })).not.toBeInTheDocument()
    expect(titleBar().children).toHaveLength(1)
  })

  it('leaves the window controls to the native title bar', () => {
    renderTitleBar()

    for (const label of ['کوچک کردن', 'تمام صفحه', 'بستن']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })
})
