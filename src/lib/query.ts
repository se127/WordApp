import { QueryClient, queryOptions } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 0,
        retryOnMount: false,
      },
    },
  })
}

export const queryClient = createQueryClient()

export const documentsCountQuery = queryOptions({
  queryKey: ['documents', 'count'],
  queryFn: async () => (await window.WordApp?.documents.count()) ?? null,
  staleTime: Infinity,
})

export const documentQuery = (id: number) =>
  queryOptions({
    queryKey: ['documents', id],
    queryFn: async () => (await window.WordApp?.documents.get(id)) ?? null,
    staleTime: Infinity,
  })
