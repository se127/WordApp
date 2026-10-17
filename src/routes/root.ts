import { AppShell } from '@/components/app-shell'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext } from '@tanstack/react-router'

export const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({ component: AppShell })
