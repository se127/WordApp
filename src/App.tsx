import { router } from '@/router'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'

// The window shell lives in the root route (src/routes/root.tsx); the app
// itself only mounts the router and tells the main process it is ready.
function App() {
  useEffect(() => {
    // React has mounted; ask the main process to reveal the hidden window.
    window.WordApp?.ready()
  }, [])

  return <RouterProvider router={router} />
}

export default App
