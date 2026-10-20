import { readHomeOrder, readHomePage, readHomeSearch } from '@/lib/home-page'
import { documentsCountQueryFor, documentsQuery } from '@/lib/query'
import { HomePage } from '@/pages/home'
import { rootRoute } from '@/routes/root'
import { createRoute } from '@tanstack/react-router'

export const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
  loader: ({ context }) => {
    const search = readHomeSearch()
    void context.queryClient
      .query(documentsCountQueryFor(search))
      .catch(() => {})
    void context.queryClient
      .query(documentsQuery(readHomePage(), readHomeOrder(), search))
      .catch(() => {})
  },
})
