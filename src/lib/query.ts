import { QueryClient, queryOptions } from '@tanstack/react-query'

// Builds a QueryClient with the app's defaults. The app creates one for the
// renderer's whole lifetime (below); tests create one per case so every case
// starts with an empty cache.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Freshness is explicit in this app: every query below opts into an
        // infinite stale time and stays fresh until a write invalidates the
        // queries it changed (the invalidation then lasts until a successful
        // read clears it). A query that does not opt in keeps this client's
        // zero default and is stale immediately.
        //
        // All three automatic refetch triggers stay off for the same reason:
        // a mount refetch would repeat a read nothing has changed since, and
        // window focus or a reconnect says nothing about a local SQLite
        // database.
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        // Zero retries: one failed local read will fail the same way again,
        // so surface the error instead of repeating it.
        retry: 0,
      },
    },
  })
}

// The renderer's single QueryClient, created the first time this module is
// imported and shared by every reader: App.tsx passes it to
// QueryClientProvider, and createAppRouter hands it to every route loader.
export const queryClient = createQueryClient()

// The two queries every page reads from, both fresh until a write invalidates
// them. The preload bridge can be missing (the very first render, tests
// without it) and query data may not be `undefined`, so both query functions
// resolve a missing result to `null`.

// How many documents exist, as shown on the home page. Creating a document
// invalidates it (src/pages/home.tsx), so the next read goes to the database
// again; a plain visit reuses the cached count.
export const documentsCountQuery = queryOptions({
  queryKey: ['documents', 'count'],
  queryFn: async () => (await window.WordApp?.documents.count()) ?? null,
  staleTime: Infinity,
})

// One document by id, as shown on its page. Revisiting a document reuses the
// cached row; a future edit will invalidate this query so the next visit
// re-reads it from the database.
export const documentQuery = (id: number) =>
  queryOptions({
    queryKey: ['documents', id],
    queryFn: async () => (await window.WordApp?.documents.get(id)) ?? null,
    staleTime: Infinity,
  })
