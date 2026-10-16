import { queryClient } from '@/lib/query'
import { router } from '@/router'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'

// The window shell lives in the root route (src/routes/root.ts); the app
// mounts the router behind the QueryClient its route loaders and page
// components share, and retires the loading screen index.html painted while
// the bundle loaded.
function App() {
  useEffect(() => {
    // React has mounted; the pre-mount loading screen (index.html) is done.
    document.getElementById('app-loading')?.remove()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export default App
