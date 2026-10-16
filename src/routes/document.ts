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
  // cache once the row is known and no write invalidated it.
  loader: ({ context, params }) =>
    context.queryClient.query(documentQuery(Number(params.documentId))),
})
