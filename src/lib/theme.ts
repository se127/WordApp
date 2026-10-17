export type Theme = 'light' | 'dark' | 'system'

const storageKey = import.meta.env.DEV ? 'wordapp-theme-dev' : 'wordapp-theme'

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function readTheme(): Theme {
  const stored = localStorage.getItem(storageKey)
  return isTheme(stored) ? stored : 'system'
}

export function storeTheme(theme: Theme): void {
  localStorage.setItem(storageKey, theme)
}

export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}
