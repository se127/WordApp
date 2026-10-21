import { RouteNotFound } from '@/components/route-not-found'
import { queryClient } from '@/lib/query'
import { documentRoute } from '@/routes/document'
import { homeRoute } from '@/routes/home'
import { rootRoute } from '@/routes/root'
import type { QueryClient } from '@tanstack/react-query'
import {
  createHashHistory,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router'

export const routeTree = rootRoute.addChildren([homeRoute, documentRoute])

export function createAppRouter(
  history: RouterHistory,
  queryClient: QueryClient,
) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultStaleTime: 0,
    defaultPreload: false,
    defaultNotFoundComponent: RouteNotFound,
  })
}

export const router = createAppRouter(createHashHistory(), queryClient)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
