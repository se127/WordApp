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
          from every side by p-4. */}
      <header className="flex shrink-0 items-center justify-between p-4 [-webkit-app-region:drag]">
        <WindowControls />
        <ThemePicker />
      </header>
    </div>
  )
}

export default App
