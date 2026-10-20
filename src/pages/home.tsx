import { DocumentOptions } from '@/components/document-options'
import { DocumentsPagination } from '@/components/documents-pagination'
import { DocumentsSelectionToolbar } from '@/components/documents-selection'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatAbsoluteDate, formatRelativeTime } from '@/lib/date'
import { useCreateDocument } from '@/lib/documents'
import { readHomePage, saveHomePage } from '@/lib/home-page'
import { formatNumber } from '@/lib/number'
import {
  documentPageSize,
  documentsCountQuery,
  documentsQuery,
} from '@/lib/query'
import { cn } from '@/lib/utils'
import type { DocumentRecord } from '@/types/global'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'

function HomePage() {
  const { createDocument, isCreating } = useCreateDocument()

  return (
    <div className="flex h-full flex-col items-start gap-3 p-6">
      <h1 className="flex h-8 items-center gap-1.5 text-2xl font-semibold">
        {'مستندات '}
        <DocumentCount />
      </h1>
      <Button disabled={isCreating} onClick={createDocument}>
        {isCreating ? (
          <>
            <LoaderCircle className="size-4 animate-spin" />
            در حال ساخت سند...
          </>
        ) : (
          <>
            <Plus />
            افزودن سند
          </>
        )}
      </Button>
      <DocumentsTable />
    </div>
  )
}

function DocumentsTable() {
  const [page, setPage] = useState(readHomePage)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(
    new Set<number>(),
  )
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const { data: documentCount } = useQuery(documentsCountQuery)
  const totalPages =
    documentCount === undefined || documentCount === null
      ? undefined
      : Math.max(1, Math.ceil(documentCount / documentPageSize))
  const currentPage =
    totalPages === undefined ? page : Math.min(page, totalPages)
  const {
    data: documents,
    isError,
    isFetching,
    isRefetching,
    refetch,
  } = useQuery(documentsQuery(currentPage))

  const attachScrollArea = useCallback((node: HTMLDivElement | null) => {
    scrollViewportRef.current =
      node?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null
  }, [])

  const changePage = useCallback((nextPage: number): void => {
    saveHomePage(nextPage)
    setPage(nextPage)
  }, [])

  useEffect(() => {
    saveHomePage(currentPage)
    const viewport = scrollViewportRef.current
    if (viewport !== null) {
      viewport.scrollTop = 0
    }
  }, [currentPage])

  const toggleSelecting = useCallback((): void => {
    setIsSelecting((selecting) => !selecting)
    setSelectedIds(new Set<number>())
  }, [])

  const toggleSelectedDocument = useCallback((id: number): void => {
    setSelectedIds((ids) => {
      const next = new Set(ids)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const clearSelectedDocuments = useCallback((): void => {
    setSelectedIds(new Set<number>())
  }, [])

  if (isError) {
    return (
      <DocumentsRetry isRetrying={isFetching} onRetry={() => void refetch()} />
    )
  }

  if (documents === undefined) {
    return <DocumentsPending />
  }

  if (documents === null) {
    return null
  }

  if (documents.length === 0) {
    if (currentPage > 1) {
      return <DocumentsPending />
    }

    return (
      <div className="flex min-h-32 w-full flex-1 items-center justify-center">
        <p className="text-sm">هنوز سندی ثبت نشده است.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <DocumentsSelectionToolbar
        isSelecting={isSelecting}
        selectedIds={selectedIds}
        onToggleSelecting={toggleSelecting}
        onDocumentsDeleted={clearSelectedDocuments}
      />
      <div
        aria-busy={isRefetching}
        inert={isRefetching ? true : undefined}
        data-slot="documents-table"
        className={cn(
          'flex min-h-0 w-full flex-1 flex-col',
          isRefetching && 'pointer-events-none animate-pulse',
        )}
      >
        <Table className="table-fixed">
          <DocumentTableColumns isSelecting={isSelecting} />
          <TableHeader>
            <TableRow>
              {isSelecting ? <TableHead /> : null}
              <TableHead>عنوان</TableHead>
              <TableHead className="text-center">تاریخ ایجاد</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
        </Table>
        <ScrollArea
          ref={attachScrollArea}
          className="min-h-0 w-full flex-1 [&_[data-slot=table-container]]:overflow-visible"
        >
          <Table className="table-fixed">
            <DocumentTableColumns isSelecting={isSelecting} />
            <TableBody>
              {documents.map((document) => (
                <DocumentTableRow
                  key={document.id}
                  document={document}
                  deletedPage={currentPage}
                  isSelecting={isSelecting}
                  isSelected={selectedIds.has(document.id)}
                  onToggleSelected={toggleSelectedDocument}
                />
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
      {totalPages !== undefined && totalPages > 1 ? (
        <DocumentsPagination
          page={currentPage}
          totalPages={totalPages}
          isDisabled={isFetching}
          onPageChange={changePage}
        />
      ) : null}
    </div>
  )
}

function DocumentTableColumns({ isSelecting }: { isSelecting: boolean }) {
  return (
    <colgroup>
      {isSelecting ? <col className="w-6" /> : null}
      <col className="w-[60%]" />
      <col className="w-[20%]" />
      <col className="w-[20%]" />
    </colgroup>
  )
}

const DocumentTableRow = memo(function DocumentTableRow({
  document,
  deletedPage,
  isSelecting,
  isSelected,
  onToggleSelected,
}: {
  document: DocumentRecord
  deletedPage: number
  isSelecting: boolean
  isSelected: boolean
  onToggleSelected: (id: number) => void
}) {
  return (
    <TableRow data-state={isSelected ? 'selected' : undefined}>
      {isSelecting ? (
        <TableCell>
          <Checkbox
            checked={isSelected}
            aria-label={`انتخاب سند ${document.title}`}
            onCheckedChange={() => onToggleSelected(document.id)}
          />
        </TableCell>
      ) : null}
      <TableCell className="whitespace-normal">
        {isSelecting ? (
          <button
            type="button"
            className="block w-full rounded-sm text-start break-words outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => onToggleSelected(document.id)}
          >
            {document.title}
          </button>
        ) : (
          <Link
            to="/documents/$documentId"
            params={{ documentId: String(document.id) }}
            className="block rounded-sm break-words outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {document.title}
          </Link>
        )}
        {document.updatedAt !== document.createdAt ? (
          <DocumentUpdatedAt updatedAt={document.updatedAt} />
        ) : null}
      </TableCell>
      <TableCell className="text-center">
        <DocumentCreatedAt createdAt={document.createdAt} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <DocumentOptions
            documentId={document.id}
            documentTitle={document.title}
            deletedPage={deletedPage}
          />
        </div>
      </TableCell>
    </TableRow>
  )
})

function DocumentCreatedAt({ createdAt }: { createdAt: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="cursor-default rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {formatRelativeTime(createdAt)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatAbsoluteDate(createdAt)}</TooltipContent>
    </Tooltip>
  )
}

function DocumentUpdatedAt({ updatedAt }: { updatedAt: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="cursor-default rounded-sm text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {`ویرایش شده: ${formatRelativeTime(updatedAt)}`}
        </span>
      </TooltipTrigger>
      <TooltipContent>{formatAbsoluteDate(updatedAt)}</TooltipContent>
    </Tooltip>
  )
}

function DocumentsPending() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری سندها"
      className="flex min-h-32 w-full flex-1 items-center justify-center gap-2 text-sm"
    >
      <LoaderCircle className="size-4 animate-spin" />
      در حال بارگذاری سندها...
    </div>
  )
}

function DocumentsRetry({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-32 w-full flex-1 flex-col items-center justify-center gap-3">
      <p className="text-sm text-destructive">
        بارگذاری سندها ناموفق بود. دوباره تلاش کنید.
      </p>
      <Button variant="outline" disabled={isRetrying} onClick={onRetry}>
        <RefreshCw
          className={cn(
            'size-4 text-destructive',
            isRetrying && 'animate-spin',
          )}
        />
        تلاش دوباره
      </Button>
    </div>
  )
}

function DocumentCount() {
  const {
    data: documentCount,
    isFetching,
    isError,
    refetch,
  } = useQuery(documentsCountQuery)

  if (isError) {
    return <CountRetry isRetrying={isFetching} onRetry={() => void refetch()} />
  }

  if (documentCount === undefined) {
    return <CountPending />
  }

  if (documentCount === null) {
    return null
  }

  return (
    <span className={isFetching ? 'animate-pulse' : undefined}>
      ({formatNumber(documentCount)})
    </span>
  )
}

function CountRetry({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean
  onRetry: () => void
}) {
  const retryLabel = 'تلاش دوباره برای دریافت تعداد سندها'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:text-destructive"
          aria-label={retryLabel}
          disabled={isRetrying}
          onClick={onRetry}
        >
          <RefreshCw className={cn('size-4', isRetrying && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{retryLabel}</TooltipContent>
    </Tooltip>
  )
}

function CountPending() {
  return (
    <LoaderCircle
      role="status"
      aria-label="در حال بارگذاری"
      className="size-4 animate-spin text-black dark:text-white"
    />
  )
}

export { HomePage }
