import { documentRoute } from '@/routes/document'
import { homeRoute } from '@/routes/home'
import { rootRoute } from '@/routes/root'
import {
  createHashHistory,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router'

export const routeTree = rootRoute.addChildren([homeRoute, documentRoute])

// Hash history keeps the current route in the URL fragment, which is the
// reliable shape for the packaged app's file:// page; dev runs and tests are
// the same routes over whichever history they inject.
export function createAppRouter(history: RouterHistory = createHashHistory()) {
  return createRouter({
    routeTree,
    history,
    // Loader data is stale immediately, so every visit to a document page
    // reads the row fresh from the database instead of reusing a cached copy.
    defaultStaleTime: 0,
  })
}

export const router = createAppRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
