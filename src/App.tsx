import { useEffect } from 'react'

function App() {
  useEffect(() => {
    // React has mounted; ask the main process to reveal the hidden window.
    window.WordApp?.ready()
  }, [])

  return null
}

export default App
