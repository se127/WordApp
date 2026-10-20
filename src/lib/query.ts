import {
  keepPreviousData,
  queryOptions,
  QueryClient,
} from '@tanstack/react-query'
import type { DocumentListOptions, DocumentListOrder } from '@/types/global'

let nextRequestId = 0
const requestIdPrefix = Math.random().toString(36).slice(2)

function createRequestId(): string {
  nextRequestId += 1
  return `${requestIdPrefix}:${nextRequestId}`
}

function requestWithCancel<T>(
  signal: AbortSignal,
  operation: (requestId: string) => Promise<T>,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason)
  }

  const requestId = createRequestId()
  const cancel = (): void => {
    window.WordApp?.documents.cancel(requestId)
  }

  signal.addEventListener('abort', cancel, { once: true })

  return Promise.resolve()
    .then(() => operation(requestId))
    .finally(() => {
      signal.removeEventListener('abort', cancel)
    })
}

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
  queryFn: ({ signal }) =>
    requestWithCancel(
      signal,
      async (requestId) =>
        (await window.WordApp?.documents.count(undefined, requestId)) ?? null,
    ),
  placeholderData: keepPreviousData,
  refetchOnMount: true,
  staleTime: Infinity,
})

export function documentsCountQueryFor(search: string) {
  const term = search.trim()
  if (term === '') {
    return documentsCountQuery
  }

  return queryOptions({
    queryKey: [...documentsCountQuery.queryKey, term],
    queryFn: ({ signal }) =>
      requestWithCancel(
        signal,
        async (requestId) =>
          (await window.WordApp?.documents.count(term, requestId)) ?? null,
      ),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    staleTime: Infinity,
  })
}

export const documentPageSize = 15

export const documentsQueryKey = ['documents', 'list'] as const

export const documentsQuery = (
  page: number,
  order: DocumentListOrder = 'newest',
  search = '',
) => {
  const term = search.trim()
  const queryKey: Array<string | number> = [...documentsQueryKey, page, order]
  const listOptions: DocumentListOptions = {
    offset: (page - 1) * documentPageSize,
    limit: documentPageSize,
    order,
  }

  if (term !== '') {
    queryKey.push(term)
    listOptions.search = term
  }

  return queryOptions({
    queryKey,
    queryFn: ({ signal }) =>
      requestWithCancel(
        signal,
        async (requestId) =>
          (await window.WordApp?.documents.list(listOptions, requestId)) ??
          null,
      ),
    placeholderData: keepPreviousData,
    refetchOnMount: true,
    staleTime: Infinity,
  })
}

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
