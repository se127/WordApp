import { DocumentOptions } from '@/components/document-options'
import { Button } from '@/components/ui/button'
import { registerCloseSave, trackDocumentSave } from '@/lib/close-handshake'
import {
  documentQuery,
  documentsCountQuery,
  documentsQueryKey,
} from '@/lib/query'
import type { DocumentChanges } from '@/types/global'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const documentRouteApi = getRouteApi('/documents/$documentId')

function DocumentPage() {
  const { documentId } = documentRouteApi.useParams()
  const navigate = useNavigate()
  const {
    data: document,
    isError,
    refetch,
  } = useQuery(documentQuery(Number(documentId)))

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <div className="flex items-center">
        <Button variant="outline" asChild>
          <Link to="/" replace>
            <ArrowRight />
            بازگشت به مستندات
          </Link>
        </Button>
      </div>

      {document ? (
        <div className="flex items-center gap-3">
          <DocumentTitle
            documentId={Number(documentId)}
            title={document.title}
          />
          <DocumentOptions
            documentId={Number(documentId)}
            documentTitle={document.title}
            onDocumentDeleted={() => navigate({ to: '/', replace: true })}
          />
        </div>
      ) : null}

      {isError ? (
        <DocumentRetry onRetry={() => void refetch()} />
      ) : document === undefined ? (
        <DocumentPending />
      ) : document === null ? (
        <DocumentMissing />
      ) : document.body ? (
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
  const skipCommit = useRef(false)
  const savingPromiseRef = useRef<Promise<boolean> | null>(null)
  const commitTitleRef = useRef<() => Promise<void>>(async () => {})

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
    skipCommit.current = false
    selectOnOpen.current = true
    setDraft(title)
  }

  const commitTitle = async (): Promise<void> => {
    if (draft === null || isSaving) {
      return
    }

    if (skipCommit.current) {
      skipCommit.current = false
      return
    }

    const nextTitle = draft.trim()

    if (nextTitle === title || nextTitle === '') {
      setDraft(null)
      return
    }

    setIsSaving(true)
    const savingPromise = saveDocument({ title: nextTitle })
    savingPromiseRef.current = savingPromise
    const saved = await savingPromise
    savingPromiseRef.current = null
    setIsSaving(false)

    if (saved) {
      setDraft(null)
    } else {
      returnFocusToHeading.current = false
    }
  }

  useEffect(() => {
    commitTitleRef.current = commitTitle
  })

  useEffect(
    () =>
      registerCloseSave(async () => {
        const savingPromise = savingPromiseRef.current
        if (savingPromise !== null) {
          await savingPromise
          return
        }

        await commitTitleRef.current()
      }),
    [],
  )

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
          if (event.key === 'Escape') {
            event.preventDefault()
            skipCommit.current = true
            returnFocusToHeading.current = true
            setDraft(null)
            return
          }

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
    const saved = await trackDocumentSave(
      Promise.resolve()
        .then(() => window.WordApp?.documents.save(documentId, changes))
        .catch(() => undefined),
    )

    if (!saved) {
      toast.error('ذخیره ی سند ناموفق بود. دوباره تلاش کنید.')
      return false
    }

    queryClient.setQueryData(documentQuery(documentId).queryKey, saved)
    void queryClient.invalidateQueries({
      queryKey: documentsCountQuery.queryKey,
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

function DocumentMissing() {
  return (
    <div className="flex min-h-32 w-full flex-1 items-center justify-center">
      <p className="text-sm">سندی با این شناسه پیدا نشد.</p>
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
