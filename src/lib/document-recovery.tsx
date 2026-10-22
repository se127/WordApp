import { Button } from '@/components/ui/button'
import { trackDocumentSave } from '@/lib/close-handshake'
import { saveDocumentWithTimeout } from '@/lib/document-save'
import {
  markDocumentSaveFailed,
  markDocumentSaveSucceeded,
} from '@/lib/document-save-state'
import { hasPendingDocumentChanges } from '@/lib/pending-changes'
import { documentQuery, documentsQueryKey } from '@/lib/query'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

type RememberedDocumentChanges = {
  documentId: number
  changes: DocumentChanges
  revision: number
  waitFor: Promise<unknown> | null
}

const rememberedChanges = new WeakMap<
  QueryClient,
  Map<number, RememberedDocumentChanges>
>()

function recoveryEntries(
  queryClient: QueryClient,
): Map<number, RememberedDocumentChanges> {
  const existing = rememberedChanges.get(queryClient)
  if (existing !== undefined) {
    return existing
  }

  const created = new Map<number, RememberedDocumentChanges>()
  rememberedChanges.set(queryClient, created)
  return created
}

function rememberDocumentChanges(
  queryClient: QueryClient,
  documentId: number,
  changes: DocumentChanges,
  revision: number,
  waitFor?: Promise<unknown> | null,
): void {
  const entries = recoveryEntries(queryClient)
  const existing = entries.get(documentId)

  if (existing !== undefined && existing.revision > revision) {
    return
  }

  entries.set(documentId, {
    documentId,
    changes: { ...changes },
    revision,
    waitFor: waitFor === undefined ? (existing?.waitFor ?? null) : waitFor,
  })
}

function setRememberedDocumentWait(
  queryClient: QueryClient,
  documentId: number,
  waitFor: Promise<unknown>,
): void {
  const entry = recoveryEntries(queryClient).get(documentId)
  if (entry !== undefined) {
    entry.waitFor = waitFor
  }
}

function rememberedDocumentChanges(
  queryClient: QueryClient,
  documentId: number,
): RememberedDocumentChanges | null {
  return recoveryEntries(queryClient).get(documentId) ?? null
}

function rememberedDocumentChangeList(
  queryClient: QueryClient,
): Array<RememberedDocumentChanges> {
  return [...recoveryEntries(queryClient).values()]
}

function forgetDocumentChanges(
  queryClient: QueryClient,
  documentId: number,
  revision?: number,
): void {
  const entries = recoveryEntries(queryClient)
  if (revision === undefined) {
    entries.delete(documentId)
    return
  }

  const existing = entries.get(documentId)
  if (existing !== undefined && existing.revision <= revision) {
    entries.delete(documentId)
  }
}

async function documentExists(documentId: number): Promise<boolean | null> {
  const bridge = window.WordApp
  if (bridge === undefined) {
    return null
  }

  return Promise.resolve()
    .then(() => bridge.documents.get(documentId))
    .then(
      (document) => document !== undefined,
      () => null,
    )
}

function showRecoveryFailureToast(
  documentId: number,
  onOpenDocument?: (documentId: number) => void,
): string | number {
  let toastId: string | number | undefined
  toastId = toast.error('ذخیره ی تغییرات ناموفق بود. دوباره تلاش کنید.', {
    description:
      onOpenDocument === undefined ? undefined : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 w-full text-foreground"
          onClick={() => {
            if (toastId !== undefined) {
              toast.dismiss(toastId)
            }
            onOpenDocument(documentId)
          }}
        >
          باز کردن سند
        </Button>
      ),
  })
  return toastId
}

function checkDocumentExistenceAfterFailure(
  queryClient: QueryClient,
  entry: RememberedDocumentChanges,
  toastId: string | number,
): void {
  void documentExists(entry.documentId).then((exists) => {
    if (exists !== false) {
      return
    }

    const current = rememberedDocumentChanges(queryClient, entry.documentId)
    if (current !== null && current !== entry) {
      toast.dismiss(toastId)
      return
    }

    if (current !== null) {
      forgetDocumentChanges(queryClient, entry.documentId, entry.revision)
      markDocumentSaveSucceeded(queryClient, entry.documentId)
    }
    toast.dismiss(toastId)
  })
}

async function retryRememberedDocumentChanges(
  queryClient: QueryClient,
  onOpenDocument?: (documentId: number) => void,
): Promise<boolean> {
  const entries = rememberedDocumentChangeList(queryClient).filter(
    (entry) => !hasPendingDocumentChanges(entry.documentId),
  )

  for (const entry of entries) {
    if (hasPendingDocumentChanges(entry.documentId)) {
      continue
    }

    if (entry.waitFor !== null) {
      await entry.waitFor.catch(() => {})
    }

    const current = rememberedDocumentChanges(queryClient, entry.documentId)
    if (current === null || hasPendingDocumentChanges(current.documentId)) {
      continue
    }

    const saved = await trackDocumentSave(
      saveDocumentWithTimeout(current.documentId, current.changes),
    )
    if (saved === undefined) {
      markDocumentSaveFailed(queryClient, current.documentId)
      const toastId = showRecoveryFailureToast(
        current.documentId,
        onOpenDocument,
      )
      checkDocumentExistenceAfterFailure(queryClient, current, toastId)
      return false
    }

    forgetDocumentChanges(queryClient, current.documentId, current.revision)
    markDocumentSaveSucceeded(queryClient, current.documentId)
    queryClient.setQueryData<DocumentRecord | undefined>(
      documentQuery(current.documentId).queryKey,
      (existing) =>
        existing === undefined ||
        existing === null ||
        existing.updatedAt <= saved.updatedAt
          ? saved
          : existing,
    )
    void queryClient.invalidateQueries({ queryKey: documentsQueryKey })
  }

  return true
}

export {
  forgetDocumentChanges,
  rememberedDocumentChangeList,
  rememberedDocumentChanges,
  rememberDocumentChanges,
  retryRememberedDocumentChanges,
  setRememberedDocumentWait,
}
