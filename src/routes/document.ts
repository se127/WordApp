import { DocumentPage } from '@/pages/document'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const documentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/documents/$documentId',
  component: DocumentPage,
  loader: ({ params }) =>
    window.WordApp?.documents.get(Number(params.documentId)),
})
