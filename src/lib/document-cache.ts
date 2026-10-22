import { documentQuery, documentsQueryKey } from '@/lib/query'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import type { QueryClient } from '@tanstack/react-query'

function mergeDocumentChanges(
  document: DocumentRecord,
  changes: DocumentChanges,
): DocumentRecord {
  const merged = { ...document }

  if (changes.title !== undefined) {
    merged.title = changes.title
  }

  if (changes.body !== undefined) {
    merged.body = changes.body
  }

  return merged
}

function invalidateDocumentLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    queryKey: documentsQueryKey,
    refetchType: 'none',
  })
}

function hasDocumentListEntry(
  queryClient: QueryClient,
  documentId: number,
): boolean {
  return queryClient
    .getQueriesData<DocumentRecord[] | null>({ queryKey: documentsQueryKey })
    .some(
      ([, documents]) =>
        documents?.some((document) => document.id === documentId) ?? false,
    )
}

function invalidateDocumentListsIfMissing(
  queryClient: QueryClient,
  documentId: number,
): void {
  if (!hasDocumentListEntry(queryClient, documentId)) {
    invalidateDocumentLists(queryClient)
  }
}

function applyDocumentChanges(
  queryClient: QueryClient,
  documentId: number,
  changes: DocumentChanges,
): void {
  queryClient.setQueryData<DocumentRecord | null>(
    documentQuery(documentId).queryKey,
    (current) =>
      current === undefined || current === null
        ? current
        : mergeDocumentChanges(current, changes),
  )

  const foundInList = hasDocumentListEntry(queryClient, documentId)
  const listsWereInvalidated = queryClient
    .getQueryCache()
    .findAll({ queryKey: documentsQueryKey })
    .some((query) => query.state.isInvalidated)

  queryClient.setQueriesData<DocumentRecord[] | null>(
    { queryKey: documentsQueryKey },
    (current) =>
      current === undefined || current === null
        ? current
        : current.map((document) =>
            document.id === documentId
              ? mergeDocumentChanges(document, changes)
              : document,
          ),
  )

  if (!foundInList || listsWereInvalidated) {
    invalidateDocumentLists(queryClient)
  }
}

export { applyDocumentChanges, invalidateDocumentListsIfMissing }
