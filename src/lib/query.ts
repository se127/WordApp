import {
  keepPreviousData,
  queryOptions,
  QueryClient,
} from '@tanstack/react-query'

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

export const documentPageSize = 15

export const documentsQueryKey = ['documents', 'list'] as const

export const documentsQuery = (page: number) =>
  queryOptions({
    queryKey: [...documentsQueryKey, page],
    queryFn: async () =>
      (await window.WordApp?.documents.list({
        offset: (page - 1) * documentPageSize,
        limit: documentPageSize,
      })) ?? null,
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    staleTime: Infinity,
  })

export function invalidateDocumentPagesFrom(
  queryClient: QueryClient,
  page: number,
): void {
  void queryClient.invalidateQueries({
    queryKey: documentsQueryKey,
    predicate: (query) => {
      const cachedPage = query.queryKey[2]
      return typeof cachedPage === 'number' && cachedPage >= page
    },
  })
}

export const documentQuery = (id: number) =>
  queryOptions({
    queryKey: ['documents', id],
    queryFn: async () => (await window.WordApp?.documents.get(id)) ?? null,
    staleTime: Infinity,
  })
