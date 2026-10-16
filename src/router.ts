import { RoutePending } from '@/components/route-pending'
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

// Builds a router over the given history that hands the given QueryClient to
// every route's loader through context. The app builds its single router with
// the renderer's QueryClient (below); tests build one per case with a fresh
// client so no cache leaks between them.
export function createAppRouter(
  history: RouterHistory,
  queryClient: QueryClient,
) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    // The router never treats loader data as fresh by itself: every visit
    // runs its route's loader again, and the loader always re-reads its
    // query (no query keeps a stale time), so each visit reads the database.
    defaultStaleTime: 0,
    // Nothing runs before the user actually opens a route.
    defaultPreload: false,
    // Present the pending UI the moment a route waits on data, and never
    // hold it once the data is ready.
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: RoutePending,
  })
}

export const router = createAppRouter(
  // Hash history keeps the current route in the URL fragment, which is the
  // reliable shape for the packaged app's file:// page; dev runs and tests
  // are the same routes over whichever history they inject.
  createHashHistory(),
  queryClient,
)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
