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

    expect(titleBar()).toHaveClass('flex', 'items-center', 'select-none')
    expect(titleBar()).not.toHaveClass('h-16')
    expect(screen.queryByText('WordApp')).toBeNull()
  })

  it('hosts the theme picker at the left edge after the trailing content', () => {
    renderTitleBar()

    const bar = titleBar()
    const picker = within(bar).getByRole('button', {
      name: 'تغییر پوسته',
    })

    expect(picker.parentElement).toBe(bar.lastElementChild)
    expect(picker.parentElement).toHaveClass('ms-auto')
    expect(picker.parentElement).not.toHaveClass('ps-4')
  })

  it('places trailing content at the right edge before the theme picker', () => {
    render(
      <TooltipProvider>
        <TitleBar trailing={<span>بازگشت به مستندات</span>} />
      </TooltipProvider>,
    )

    const bar = titleBar()
    const trailing = within(bar).getByText('بازگشت به مستندات').parentElement

    expect(bar).toHaveClass('justify-between')
    expect(trailing).toBe(bar.firstElementChild)
    expect(trailing).not.toHaveClass('pe-4')
  })

  it('centers content between the theme picker and trailing content', () => {
    render(
      <TooltipProvider>
        <TitleBar
          center={<span>در حال ذخیره...</span>}
          trailing={<span>بازگشت به مستندات</span>}
        />
      </TooltipProvider>,
    )

    const bar = titleBar()
    const center = within(bar).getByText('در حال ذخیره...').parentElement

    expect(bar).toHaveClass('relative')
    expect(center).toHaveClass('absolute', 'left-1/2', '-translate-x-1/2')
    expect(bar?.lastElementChild).toContainElement(
      screen.getByRole('button', { name: 'تغییر پوسته' }),
    )
    expect(center?.nextElementSibling).toBe(bar.lastElementChild)
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
