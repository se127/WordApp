import { useEffect } from 'react'
import { ThemePicker } from '@/components/theme-picker'
import { WindowControls } from '@/components/window-controls'

function App() {
  useEffect(() => {
    // React has mounted; ask the main process to reveal the hidden window.
    window.WordApp?.ready()
  }, [])

  return (
    <div className="flex h-screen flex-col bg-emerald-50 dark:bg-zinc-900">
      {/* Drag zone for the frameless window: the whole top strip moves the
          window. The document is RTL, so the caption buttons pack against the
          right edge and the theme picker sits on the left, both padded 16px
          from the top and the sides. The gap over the content area below the
          strip is a margin, so it is not part of the draggable region. */}
      <header className="mb-4 flex shrink-0 items-center justify-between px-4 pt-4 [-webkit-app-region:drag]">
        <WindowControls />
        <ThemePicker />
      </header>
      {/* Main content area: fills the window under the drag zone and is inset
          16px from the bottom, right, and left, with the buttons' radius. */}
      <main className="mx-4 mb-4 flex-1 rounded-lg border border-border bg-white dark:border-input dark:bg-zinc-800" />
    </div>
  )
}

export default App
