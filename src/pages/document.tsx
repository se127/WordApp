import { DocumentBodyEditor } from '@/components/document-body-editor'
import { DocumentOptions } from '@/components/document-options'
import { DocumentSaveStatus } from '@/components/document-save-status'
import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import {
  applyDocumentChanges,
  invalidateDocumentListsIfMissing,
} from '@/lib/document-cache'
import { documentTitleLabel } from '@/lib/documents'
import { forgetDocumentChanges } from '@/lib/document-recovery'
import { hasDocumentSaveFailed } from '@/lib/document-save-state'
import { pendingDocumentChanges } from '@/lib/pending-changes'
import { documentQuery } from '@/lib/query'
import { useDocumentAutosave } from '@/lib/use-document-autosave'
import type { DocumentRecord } from '@/types/global'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent } from 'react'

const documentRouteApi = getRouteApi('/documents/$documentId')

function DocumentPage() {
  const { documentId } = documentRouteApi.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const numericDocumentId = Number(documentId)
  const {
    data: document,
    isError,
    refetch,
  } = useQuery(documentQuery(numericDocumentId))

  useEffect(() => {
    if (document === null) {
      forgetDocumentChanges(queryClient, numericDocumentId)
    }
  }, [document, numericDocumentId, queryClient])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar
        center={<DocumentSaveStatus />}
        trailing={<DocumentBackLink />}
      />
      <div className="flex min-h-0 flex-1 flex-col pt-6">
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
  const {
    title,
    body,
    updateTitle,
    updateBody,
    saveNow,
    pauseAutosave,
    resumeAutosave,
  } = useDocumentAutosave(document)

  useEffect(() => {
    const saveOnShortcut = (event: KeyboardEvent): void => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.key.toLowerCase() !== 's'
      ) {
        return
      }

      event.preventDefault()
      void saveNow()
    }

    window.addEventListener('keydown', saveOnShortcut)
    return () => {
      window.removeEventListener('keydown', saveOnShortcut)
    }
  }, [saveNow])

  return (
    <>
      <div className="mb-5 flex shrink-0 items-center gap-3">
        <DocumentTitle title={title} onChange={updateTitle} />
        <DocumentOptions
          documentId={document.id}
          documentTitle={title}
          onBeforeDelete={pauseAutosave}
          onDeleteFailed={resumeAutosave}
          onDocumentDeleted={onDocumentDeleted}
        />
      </div>
      <DocumentBodyEditor
        documentId={document.id}
        body={body}
        onBodyChange={updateBody}
      />
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
      className="h-8 min-w-0 flex-1 cursor-default truncate rounded-md border border-transparent px-2 text-2xl font-semibold transition-colors outline-none hover:bg-gray-100 focus:border-input focus:bg-gray-100 dark:hover:bg-zinc-800 dark:focus:bg-zinc-800"
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
      <p className="text-sm text-destructive">بارگذاری سند ناموفق بود.</p>
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="size-4" />
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

function DocumentBackLink() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const openDocuments = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault()

    const pending = pendingDocumentChanges()
    if (pending !== null) {
      if (hasDocumentSaveFailed(queryClient, pending.documentId)) {
        invalidateDocumentListsIfMissing(queryClient, pending.documentId)
      } else {
        applyDocumentChanges(queryClient, pending.documentId, pending.changes)
      }
    }

    void navigate({ to: '/', replace: true })
  }

  return (
    <Button variant="outline" asChild>
      <Link to="/" replace dir="rtl" onClick={openDocuments}>
        <ArrowRight />
        بازگشت به مستندات
      </Link>
    </Button>
  )
}

export { DocumentPage }
