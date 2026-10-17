import { documentsCountQuery, documentsQuery } from '@/lib/query'
import { HomePage } from '@/pages/home'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
  loader: ({ context }) => {
    void context.queryClient.query(documentsCountQuery).catch(() => {})
    void context.queryClient.query(documentsQuery).catch(() => {})
  },
})
