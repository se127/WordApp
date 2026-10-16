import { queryClient } from '@/lib/query'
import { router } from '@/router'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'

// The window shell lives in the root route (src/routes/root.ts); the app
// mounts the router behind the QueryClient its route loaders and page
// components share, and tells the main process it is ready.
function App() {
  useEffect(() => {
    // React has mounted; ask the main process to reveal the hidden window.
    window.WordApp?.ready()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export default App
