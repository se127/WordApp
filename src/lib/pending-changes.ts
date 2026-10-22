import type { DocumentChanges } from '@/types/global'

export type PendingDocumentChanges = {
  documentId: number
  changes: DocumentChanges
}

const pendingChangeProviders = new Set<() => PendingDocumentChanges | null>()

function registerPendingChanges(
  provider: () => PendingDocumentChanges | null,
): () => void {
  pendingChangeProviders.add(provider)
  return () => {
    pendingChangeProviders.delete(provider)
  }
}

function pendingDocumentChanges(): PendingDocumentChanges | null {
  for (const provider of pendingChangeProviders) {
    const pending = provider()
    if (pending !== null) {
      return pending
    }
  }

  return null
}

export { pendingDocumentChanges, registerPendingChanges }
