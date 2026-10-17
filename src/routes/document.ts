import { documentQuery } from '@/lib/query'
import { DocumentPage } from '@/pages/document'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents/$documentId',
  component: DocumentPage,
  // The loader starts the row's read through the QueryClient into the cache
  // DocumentPage subscribes to: from the database on a first visit, from the
  // cache once the row is known and no write invalidated it. It does not wait
  // on the query (returning the promise would keep the whole route pending:
  // the centred spinner, with the page's back button off screen), so the page
  // renders right away and its content box shows the read's progress itself.
  // A refused read must not take the route down either: the rejection is
  // swallowed here and the page reports the failure with its retry button
  // (see src/pages/document.tsx).
  loader: ({ context, params }) => {
    void context.queryClient
      .query(documentQuery(Number(params.documentId)))
      .catch(() => {})
  },
})
