import { HomePage } from '@/pages/home'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
  // The document count is a query of its own — it is never derived from a
  // fetched document list.
  loader: () => window.WordApp?.documents.count(),
})
