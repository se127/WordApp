// Theme handling for the app shell: light, dark, or following the OS.
//
// The choice is stored in localStorage so closing and reopening the app
// restores the last pick. First launch has nothing stored and falls back to
// "system". The dev server and the built app use different storage keys, so
// the two keep separate configurations: picking a theme in one never changes
// the other.
export type Theme = 'light' | 'dark' | 'system'

// The inline script in index.html reads the same key before the first paint:
// it tells dev and built apart by the page's protocol — the runtime
// equivalent of import.meta.env.DEV here — so keep the two choices in step.
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

// The `dark` custom variant in index.css keys off the `dark` class on <html>.
export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}
