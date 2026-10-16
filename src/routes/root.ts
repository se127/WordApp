import { AppShell } from '@/components/app-shell'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext } from '@tanstack/react-router'

// Every route's loader receives the renderer's QueryClient through router
// context (createAppRouter), so loaders read data into the same cache the
// page components subscribe to.
export const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({ component: AppShell })
