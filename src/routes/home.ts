import { documentsCountQuery } from '@/lib/query'
import { HomePage } from '@/pages/home'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
  // The count is not worth holding the page back for: the loader starts the
  // read — a fetch only when the cache has nothing or a write invalidated the
  // count — and returns immediately (returning the promise would keep the
  // whole route pending: the centred spinner), so the page renders right away
  // and the heading shows the read's progress itself. The rejection is
  // swallowed because the page's query observer receives the error state.
  loader: ({ context }) => {
    void context.queryClient.query(documentsCountQuery).catch(() => {})
  },
})
