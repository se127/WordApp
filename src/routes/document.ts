import { documentQuery } from '@/lib/query'
import { DocumentPage } from '@/pages/document'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents/$documentId',
  component: DocumentPage,
  // The loader reads the row through the QueryClient into the cache
  // DocumentPage subscribes to: from the database on a first visit, from the
  // cache once the row is known and no write invalidated it. It waits for the
  // query, so the route's pending spinner covers a slow read; a refused read
  // must not take the route down, though — the rejection is swallowed here
  // and the page itself reports the failure with its retry button (see
  // src/pages/document.tsx).
  loader: async ({ context, params }) => {
    await context.queryClient
      .query(documentQuery(Number(params.documentId)))
      .catch(() => {})
  },
})
