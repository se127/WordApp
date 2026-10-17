import { ThemePicker } from '@/components/theme-picker'
import { TooltipProvider } from '@/components/ui/tooltip'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const devKey = 'wordapp-theme-dev'

function stubMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener)
    },
  }

  vi.spyOn(window, 'matchMedia').mockReturnValue(
    media as unknown as MediaQueryList,
  )

  return (nowDark: boolean) => {
    media.matches = nowDark
    for (const listener of listeners) {
      listener()
    }
  }
}

const renderPicker = () =>
  render(
    <TooltipProvider>
      <ThemePicker />
    </TooltipProvider>,
  )

const openMenu = async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'تغییر پوسته' }))
  return user
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
})

describe('ThemePicker', () => {
  it('starts on the system theme when nothing is stored', () => {
    stubMatchMedia(true)

    renderPicker()

    expect(
      screen.getByRole('button', { name: 'تغییر پوسته' }),
    ).toBeInTheDocument()
    expect(document.documentElement).toHaveClass('dark')
  })

  it('restores the stored theme over the system one', () => {
    localStorage.setItem(devKey, 'light')
    stubMatchMedia(true)

    renderPicker()

    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('lists the three themes, checks the current one, and applies picks', async () => {
    stubMatchMedia(false)

    renderPicker()
    const user = await openMenu()

    const light = await screen.findByRole('menuitemcheckbox', { name: 'روشن' })
    const dark = screen.getByRole('menuitemcheckbox', { name: 'تاریک' })
    const system = screen.getByRole('menuitemcheckbox', { name: 'سیستم' })

    expect(system).toHaveAttribute('aria-checked', 'true')
    expect(light).toHaveAttribute('aria-checked', 'false')
    expect(dark).toHaveAttribute('aria-checked', 'false')

    await user.click(dark)
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(devKey)).toBe('dark')

    await openMenu()
    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'تاریک' }),
    ).toHaveAttribute('aria-checked', 'true')

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'روشن' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(devKey)).toBe('light')
  })

  it('follows the OS while system is selected, and detaches on an explicit pick', async () => {
    const setSystemDark = stubMatchMedia(false)

    renderPicker()
    expect(document.documentElement).not.toHaveClass('dark')

    setSystemDark(true)
    expect(document.documentElement).toHaveClass('dark')

    const user = await openMenu()
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'روشن' }),
    )

    setSystemDark(false)
    setSystemDark(true)
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
