import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { documentQuery, documentsCountQuery } from '@/lib/query'
import type { DocumentChanges } from '@/types/global'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Ellipsis,
  LoaderCircle,
  RefreshCw,
  Trash,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const documentRouteApi = getRouteApi('/documents/$documentId')

function DocumentPage() {
  const { documentId } = documentRouteApi.useParams()
  const {
    data: document,
    isError,
    refetch,
  } = useQuery(documentQuery(Number(documentId)))

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <div className="flex items-center">
        <Button variant="outline" asChild>
          <Link to="/">
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
          <DocumentOptions documentId={Number(documentId)} />
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
        <LoaderCircle className="absolute end-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
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

    return true
  }
}

function DocumentOptions({ documentId }: { documentId: number }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const deleteDocument = async (): Promise<void> => {
    setIsDeleting(true)
    try {
      const deleted = await window.WordApp?.documents.delete(documentId).then(
        () => true,
        () => {
          toast.error('حذف سند ناموفق بود. دوباره تلاش کنید.')
          return false
        },
      )
      if (!deleted) {
        return
      }

      toast.success('سند حذف شد.')

      void queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })

      await navigate({ to: '/' })

      queryClient.removeQueries({
        queryKey: documentQuery(documentId).queryKey,
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="ms-auto"
                aria-label="گزینه ها"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>گزینه ها</TooltipContent>
        </Tooltip>

        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault()
              setIsDeleteDialogOpen(true)
            }}
          >
            <Trash />
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent
          onEscapeKeyDown={(event) => {
            if (isDeleting) {
              event.preventDefault()
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              آیا مطمئن هستید که می خواهید این سند را حذف کنید؟
            </AlertDialogTitle>
            <AlertDialogDescription>
              این عملیات غیر قابل بازگشت است.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault()
                void deleteDocument()
              }}
            >
              {isDeleting ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  در حال حذف...
                </>
              ) : (
                'بله'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function DocumentRetry({ onRetry }: { onRetry: () => void }) {
  const retryLabel = 'تلاش دوباره برای بارگذاری سند'

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-destructive">
        بارگذاری سند ناموفق بود. دوباره تلاش کنید.
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="text-destructive hover:text-destructive"
            aria-label={retryLabel}
            onClick={onRetry}
          >
            <RefreshCw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{retryLabel}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function DocumentPending() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className="flex min-h-32 flex-1 items-center justify-center"
    >
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export { DocumentPage }
