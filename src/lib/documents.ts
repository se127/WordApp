import { resetHomeBrowseState } from '@/lib/home-page'
import { documentsCountQuery, documentsQueryKey } from '@/lib/query'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useSyncExternalStore } from 'react'
import { toast } from 'sonner'

const untitledDocumentLabel = 'عنوانی انتخاب نشده است.'

function documentTitleLabel(title: string | null): string {
  return title === null || title.trim() === '' ? untitledDocumentLabel : title
}

const creatingDocumentListeners = new Set<() => void>()
let creatingDocumentCount = 0

function notifyCreatingDocumentListeners(): void {
  for (const listener of creatingDocumentListeners) {
    listener()
  }
}

function subscribeToCreatingDocument(listener: () => void): () => void {
  creatingDocumentListeners.add(listener)
  return () => {
    creatingDocumentListeners.delete(listener)
  }
}

function isCreatingDocument(): boolean {
  return creatingDocumentCount > 0
}

function beginCreatingDocument(): void {
  creatingDocumentCount += 1
  notifyCreatingDocumentListeners()
}

function finishCreatingDocument(): void {
  creatingDocumentCount -= 1
  notifyCreatingDocumentListeners()
}

function useCreateDocument() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isCreating = useSyncExternalStore(
    subscribeToCreatingDocument,
    isCreatingDocument,
  )

  const createDocument = useCallback(async (): Promise<void> => {
    beginCreatingDocument()
    await (async () => {
      const document = await window.WordApp?.documents.create().catch(() => {
        toast.error('افزودن سند ناموفق بود. دوباره تلاش کنید.')
        return undefined
      })
      if (!document) {
        return
      }

      void queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey })
      await navigate({
        to: '/documents/$documentId',
        params: { documentId: String(document.id) },
      })
      resetHomeBrowseState()
    })().finally(() => {
      finishCreatingDocument()
    })
  }, [navigate, queryClient])

  return { createDocument, isCreating }
}

export { documentTitleLabel, untitledDocumentLabel, useCreateDocument }
