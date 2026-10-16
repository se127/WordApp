import { useEffect } from 'react'
import { WindowControls } from '@/components/window-controls'

function App() {
  useEffect(() => {
    // React has mounted; ask the main process to reveal the hidden window.
    window.WordApp?.ready()
  }, [])

  return (
    <div className="flex h-screen flex-col">
      {/* Drag zone for the frameless window: the whole top strip moves the
          window. The document is RTL, so the controls pack against the right
          edge, padded 16px from every side by p-4. */}
      <header className="flex shrink-0 items-center p-4 [-webkit-app-region:drag]">
        <WindowControls />
      </header>
    </div>
  )
}

export default App
