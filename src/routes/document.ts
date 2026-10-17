import { documentQuery } from '@/lib/query'
import { DocumentPage } from '@/pages/document'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents/$documentId',
  component: DocumentPage,
  loader: ({ context, params }) => {
    void context.queryClient
      .query(documentQuery(Number(params.documentId)))
      .catch(() => {})
  },
})
