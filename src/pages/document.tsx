import { DocumentBodyEditor } from '@/components/document-body-editor'
import { DocumentOptions } from '@/components/document-options'
import { Button } from '@/components/ui/button'
import { documentTitleLabel } from '@/lib/documents'
import { documentQuery } from '@/lib/query'
import { useDocumentAutosave } from '@/lib/use-document-autosave'
import type { DocumentRecord } from '@/types/global'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

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
    <div className="flex h-full min-h-0 flex-col py-6">
      {isError ? (
        <DocumentRetry onRetry={() => void refetch()} />
      ) : document === undefined ? (
        <DocumentPending />
      ) : document === null ? (
        <DocumentMissing />
      ) : (
        <DocumentEditor
          key={document.id}
          document={document}
          onDocumentDeleted={() => navigate({ to: '/', replace: true })}
        />
      )}
    </div>
  )
}

function DocumentEditor({
  document,
  onDocumentDeleted,
}: {
  document: DocumentRecord
  onDocumentDeleted: () => void
}) {
  const { title, updateTitle, updateBody, pauseAutosave, resumeAutosave } =
    useDocumentAutosave(document)

  return (
    <>
      <div className="mb-3 flex shrink-0 items-center gap-3 px-6">
        <DocumentTitle title={title} onChange={updateTitle} />
        <DocumentOptions
          documentId={document.id}
          documentTitle={title}
          onBeforeDelete={pauseAutosave}
          onDeleteFailed={resumeAutosave}
          onDocumentDeleted={onDocumentDeleted}
        />
      </div>
      <DocumentBodyEditor body={document.body} onBodyChange={updateBody} />
    </>
  )
}

function DocumentTitle({
  title,
  onChange,
}: {
  title: string | null
  onChange: (title: string) => void
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const selectOnOpen = useRef(false)
  const returnFocusToHeading = useRef(false)

  useEffect(() => {
    if (!isEditing) {
      return
    }

    const input = inputRef.current
    input?.focus()
    if (input && selectOnOpen.current) {
      selectOnOpen.current = false
      input.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing && returnFocusToHeading.current) {
      returnFocusToHeading.current = false
      headingRef.current?.focus()
    }
  }, [isEditing])

  const startEditing = (): void => {
    selectOnOpen.current = true
    setIsEditing(true)
  }

  const titleLabel = documentTitleLabel(title)

  return isEditing ? (
    <input
      ref={inputRef}
      value={title ?? ''}
      aria-label="عنوان سند"
      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-2xl font-semibold outline-none"
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => setIsEditing(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          returnFocusToHeading.current = true
          setIsEditing(false)
          return
        }

        if (event.key === 'Enter') {
          returnFocusToHeading.current = true
          event.currentTarget.blur()
        }
      }}
    />
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
      {titleLabel}
    </h1>
  )
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
