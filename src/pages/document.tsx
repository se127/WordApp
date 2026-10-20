import { DocumentOptions } from '@/components/document-options'
import { Button } from '@/components/ui/button'
import { DocumentTabsContext } from '@/lib/document-tabs'
import { documentQuery, documentsQueryKey } from '@/lib/query'
import type { DocumentChanges } from '@/types/global'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const documentRouteApi = getRouteApi('/documents/$documentId')

function DocumentPage() {
  const { documentId } = documentRouteApi.useParams()
  const navigate = useNavigate()
  const { openDocumentTab } = useContext(DocumentTabsContext)
  const {
    data: document,
    isError,
    isFetching,
    refetch,
  } = useQuery(documentQuery(Number(documentId)))

  useEffect(() => {
    if (!document) {
      return
    }

    openDocumentTab({ id: document.id, title: document.title })
  }, [document, openDocumentTab])

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      {document !== undefined && isFetching ? (
        <div className="flex items-center">
          <span
            role="status"
            aria-label="در حال به روز رسانی سند"
            className="ms-auto flex items-center gap-2 text-sm"
          >
            <LoaderCircle className="size-4 animate-spin" />
            در حال به روز رسانی سند...
          </span>
        </div>
      ) : null}

      {document ? (
        <div className="flex items-center gap-3">
          <DocumentTitle
            documentId={Number(documentId)}
            title={document.title}
          />
          <DocumentOptions
            documentId={Number(documentId)}
            onDocumentDeleted={() => navigate({ to: '/' })}
          />
        </div>
      ) : null}

      {isError ? (
        <DocumentRetry onRetry={() => void refetch()} />
      ) : document === undefined ? (
        <DocumentPending />
      ) : document?.body ? (
        <p className="text-sm whitespace-pre-wrap">{document.body}</p>
      ) : null}
    </div>
  )
}

function DocumentTitle({
  documentId,
  title,
}: {
  documentId: number
  title: string
}) {
  const saveDocument = useDocumentSave(documentId)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const selectOnOpen = useRef(false)
  const returnFocusToHeading = useRef(false)

  const isEditing = draft !== null

  useEffect(() => {
    if (!isEditing || isSaving) {
      return
    }

    const input = inputRef.current
    input?.focus()
    if (input && selectOnOpen.current) {
      selectOnOpen.current = false
      input.select()
    }
  }, [isEditing, isSaving])

  useEffect(() => {
    if (!isEditing && returnFocusToHeading.current) {
      returnFocusToHeading.current = false
      headingRef.current?.focus()
    }
  }, [isEditing])

  const startEditing = (): void => {
    selectOnOpen.current = true
    setDraft(title)
  }

  const commitTitle = async (): Promise<void> => {
    if (draft === null || isSaving) {
      return
    }

    if (draft === title) {
      setDraft(null)
      return
    }

    setIsSaving(true)
    const saved = await saveDocument({ title: draft })
    setIsSaving(false)

    if (saved) {
      setDraft(null)
    } else {
      returnFocusToHeading.current = false
    }
  }

  return isEditing ? (
    <span className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        value={draft}
        disabled={isSaving}
        aria-label="عنوان سند"
        className={`h-8 w-full rounded-md border border-input bg-transparent px-2 text-2xl font-semibold outline-none disabled:opacity-60 ${isSaving ? 'pe-8' : ''}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commitTitle()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            returnFocusToHeading.current = true
            event.currentTarget.blur()
          }
        }}
      />
      {isSaving ? (
        <LoaderCircle
          role="status"
          aria-label="در حال ذخیره ی سند"
          className="absolute end-2 top-1/2 size-4 -translate-y-1/2 animate-spin"
        />
      ) : null}
    </span>
  ) : (
    <h1
      ref={headingRef}
      tabIndex={0}
      className="h-8 min-w-0 flex-1 cursor-default truncate rounded-md border border-transparent px-2 text-2xl font-semibold transition-colors outline-none hover:bg-gray-100 focus:border-input focus:bg-gray-100 dark:hover:bg-zinc-700 dark:focus:bg-zinc-700"
      onMouseDown={(event) => event.preventDefault()}
      onClick={startEditing}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault()
          startEditing()
        }
      }}
    >
      {title}
    </h1>
  )
}

function useDocumentSave(documentId: number) {
  const queryClient = useQueryClient()

  return async (changes: DocumentChanges): Promise<boolean> => {
    const saved = await window.WordApp?.documents
      .save(documentId, changes)
      .catch(() => undefined)

    if (!saved) {
      toast.error('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.')
      return false
    }

    queryClient.setQueryData(documentQuery(documentId).queryKey, saved)
    void queryClient.invalidateQueries({
      queryKey: documentQuery(documentId).queryKey,
    })
    void queryClient.invalidateQueries({
      queryKey: documentsQueryKey,
    })

    return true
  }
}

function DocumentRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-32 w-full flex-1 flex-col items-center justify-center gap-3">
      <p className="text-sm text-destructive">
        بارگذاری سند ناموفق بود. دوباره تلاش کنید.
      </p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="size-4 text-destructive" />
        تلاش دوباره
      </Button>
    </div>
  )
}

function DocumentPending() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری سند"
      className="flex min-h-32 flex-1 items-center justify-center gap-2 text-sm"
    >
      <LoaderCircle className="size-4 animate-spin" />
      در حال بارگذاری سند...
    </div>
  )
}

export { DocumentPage }
