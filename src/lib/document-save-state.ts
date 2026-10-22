import type { QueryClient } from '@tanstack/react-query'

const failedSaveDocuments = new WeakMap<QueryClient, Set<number>>()

function failedSaveDocumentIds(queryClient: QueryClient): Set<number> {
  const existing = failedSaveDocuments.get(queryClient)
  if (existing !== undefined) {
    return existing
  }

  const created = new Set<number>()
  failedSaveDocuments.set(queryClient, created)
  return created
}

function markDocumentSaveFailed(
  queryClient: QueryClient,
  documentId: number,
): void {
  failedSaveDocumentIds(queryClient).add(documentId)
}

function markDocumentSaveSucceeded(
  queryClient: QueryClient,
  documentId: number,
): void {
  failedSaveDocuments.get(queryClient)?.delete(documentId)
}

function hasDocumentSaveFailed(
  queryClient: QueryClient,
  documentId: number,
): boolean {
  return failedSaveDocuments.get(queryClient)?.has(documentId) ?? false
}

export {
  hasDocumentSaveFailed,
  markDocumentSaveFailed,
  markDocumentSaveSucceeded,
}
