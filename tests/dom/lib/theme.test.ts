import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const devKey = 'wordapp-theme-dev'
const prodKey = 'wordapp-theme'

// theme.ts picks its storage key when it is imported, so import a fresh copy
// wherever the runtime environment (dev server vs packaged app) matters.
async function importTheme() {
  vi.resetModules()
  return import('@/lib/theme')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  document.documentElement.classList.remove('dark')
})

describe('readTheme', () => {
  it('defaults to system when nothing is stored', async () => {
    const { readTheme } = await importTheme()

    expect(readTheme()).toBe('system')
  })

  it('returns the stored theme', async () => {
    localStorage.setItem(devKey, 'dark')

    const { readTheme } = await importTheme()

    expect(readTheme()).toBe('dark')
  })

  it('falls back to system when the stored value is not a theme', async () => {
    localStorage.setItem(devKey, 'sepia')

    const { readTheme } = await importTheme()

    expect(readTheme()).toBe('system')
  })
})

describe('storeTheme', () => {
  it('writes the dev key while the dev server runs', async () => {
    const { storeTheme } = await importTheme()

    storeTheme('dark')

    expect(localStorage.getItem(devKey)).toBe('dark')
    expect(localStorage.getItem(prodKey)).toBeNull()
  })

  it('writes the production key in a packaged build', async () => {
    vi.stubEnv('DEV', false)

    const { storeTheme } = await importTheme()

    storeTheme('dark')

    expect(localStorage.getItem(prodKey)).toBe('dark')
    expect(localStorage.getItem(devKey)).toBeNull()
  })
})

describe('applyTheme', () => {
  it('toggles the dark class for explicit themes', async () => {
    const { applyTheme } = await importTheme()

    applyTheme('dark')
    expect(document.documentElement).toHaveClass('dark')

    applyTheme('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('resolves system through the OS preference', async () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList)

    const { applyTheme } = await importTheme()

    applyTheme('system')
    expect(document.documentElement).toHaveClass('dark')

    matchMedia.mockReturnValue({ matches: false } as MediaQueryList)
    applyTheme('system')
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
