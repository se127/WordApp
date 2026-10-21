import { trackDocumentSave } from '@/lib/close-handshake'
import {
  documentQuery,
  documentsCountQuery,
  documentsQueryKey,
} from '@/lib/query'
import type { DocumentChanges, DocumentRecord } from '@/types/global'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'

const documentSaveDebounceMs = 500
const documentSaveTimeoutMs = 10_000

function saveDocumentWithTimeout(
  documentId: number,
  changes: DocumentChanges,
): Promise<DocumentRecord | undefined> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (saved: DocumentRecord | undefined): void => {
      if (settled) {
        return
      }

      settled = true
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      resolve(saved)
    }

    timer = setTimeout(() => finish(undefined), documentSaveTimeoutMs)

    void Promise.resolve()
      .then(() => window.WordApp?.documents.save(documentId, changes))
      .then(finish, () => finish(undefined))
  })
}

function useDocumentSave(documentId: number) {
  const queryClient = useQueryClient()

  return useCallback(
    async (
      changes: DocumentChanges,
      isSuspended?: () => boolean,
    ): Promise<boolean> => {
      if (isSuspended?.()) {
        return false
      }

      const saved = await trackDocumentSave(
        Promise.resolve().then(() => {
          if (isSuspended?.()) {
            return undefined
          }

          return saveDocumentWithTimeout(documentId, changes)
        }),
      )

      if (isSuspended?.()) {
        return false
      }

      if (!saved) {
        toast.error('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.')
        return false
      }

      queryClient.setQueryData<DocumentRecord | undefined>(
        documentQuery(documentId).queryKey,
        (current) => {
          if (current === undefined) {
            return saved
          }

          const merged = {
            ...current,
            updatedAt: Math.max(current.updatedAt, saved.updatedAt),
          }

          if (changes.title !== undefined) {
            merged.title = saved.title
          }

          if (changes.body !== undefined) {
            merged.body = saved.body
          }

          return merged
        },
      )
      void queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: documentsQueryKey,
      })

      return true
    },
    [documentId, queryClient],
  )
}

export { documentSaveDebounceMs, documentSaveTimeoutMs, useDocumentSave }
