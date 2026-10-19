import { DocumentOptions } from '@/components/document-options'
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
import { formatNumber } from '@/lib/number'
import { documentsCountQuery, documentsQuery } from '@/lib/query'
import { cn } from '@/lib/utils'
import type { DocumentRecord } from '@/types/global'
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)

  const addDocument = async (): Promise<void> => {
    setIsCreating(true)
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
      void queryClient.invalidateQueries({
        queryKey: documentsQuery.queryKey,
      })

      await navigate({
        to: '/documents/$documentId',
        params: { documentId: String(document.id) },
      })
    })().finally(() => {
      setIsCreating(false)
    })
  }

  return (
    <div className="flex h-full flex-col items-start gap-3 p-6">
      <h1 className="flex h-8 items-center gap-1.5 text-2xl font-semibold">
        {'مستندات '}
        <DocumentCount />
      </h1>
      <Button disabled={isCreating} onClick={addDocument}>
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

const estimatedTableRowHeight = 37
const tableRowOverscan = 8

const estimateTableRowSize = () => estimatedTableRowHeight

const measureTableRow = (row: HTMLTableRowElement) => {
  const measured = row.getBoundingClientRect().height
  return measured > 0 ? measured : estimatedTableRowHeight
}

function DocumentsTable() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchNextPageError,
    isFetching,
    isFetchingNextPage,
    isRefetching,
    refetch,
  } = useInfiniteQuery(documentsQuery)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(
    new Set<number>(),
  )
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const fetchingNextPageRef = useRef(false)
  const attachScrollArea = useCallback((node: HTMLDivElement | null) => {
    viewportRef.current =
      node?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]',
      ) ?? null
  }, [])
  const documents =
    data === undefined
      ? undefined
      : data.pages.some((page) => page === null)
        ? null
        : data.pages.flatMap((page) => page?.documents ?? [])
  const getItemKey = useCallback(
    (index: number) => documents?.[index]?.id ?? index,
    [documents],
  )
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

  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: documents?.length ?? 0,
    estimateSize: estimateTableRowSize,
    getItemKey,
    getScrollElement: () => viewportRef.current,
    measureElement: measureTableRow,
    overscan: tableRowOverscan,
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const firstVirtualRow = virtualRows[0]
  const lastVirtualRow = virtualRows[virtualRows.length - 1]
  const lastVirtualRowIndex = lastVirtualRow?.index
  const documentsLength = documents?.length ?? 0

  useEffect(() => {
    if (
      lastVirtualRowIndex === undefined ||
      lastVirtualRowIndex < documentsLength - 1 ||
      !hasNextPage ||
      isFetching ||
      isError ||
      fetchingNextPageRef.current
    ) {
      return
    }

    fetchingNextPageRef.current = true
    void fetchNextPage({ cancelRefetch: false }).finally(() => {
      fetchingNextPageRef.current = false
    })
  }, [
    documentsLength,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetching,
    lastVirtualRowIndex,
  ])

  if (isError && !isFetchNextPageError) {
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
        <Table className={cn('table-fixed', isRefetching && 'animate-pulse')}>
          <DocumentTableColumns isSelecting={isSelecting} />
          <TableBody>
            <TableRowSpacer
              height={firstVirtualRow?.start ?? 0}
              columns={isSelecting ? 4 : 3}
            />
            {virtualRows.map((virtualRow) => (
              <DocumentTableRow
                key={virtualRow.key}
                document={documents[virtualRow.index]}
                index={virtualRow.index}
                measureElement={rowVirtualizer.measureElement}
                isSelecting={isSelecting}
                isSelected={selectedIds.has(documents[virtualRow.index].id)}
                onToggleSelected={toggleSelectedDocument}
              />
            ))}
            <TableRowSpacer
              height={
                lastVirtualRow
                  ? rowVirtualizer.getTotalSize() - lastVirtualRow.end
                  : 0
              }
              columns={isSelecting ? 4 : 3}
            />
          </TableBody>
        </Table>
        <DocumentsListFooter
          isError={isError}
          isFetchingNextPage={isFetchingNextPage}
          onRetry={() => void fetchNextPage()}
        />
      </ScrollArea>
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

function DocumentsListFooter({
  isError,
  isFetchingNextPage,
  onRetry,
}: {
  isError: boolean
  isFetchingNextPage: boolean
  onRetry: () => void
}) {
  if (isFetchingNextPage) {
    return (
      <div
        role="status"
        className="flex w-full items-center justify-center gap-2 p-4 text-sm"
      >
        <LoaderCircle className="size-4 animate-spin" />
        در حال بارگذاری بیشتر...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 p-4">
        <p className="text-sm text-destructive">
          بارگذاری سندهای بیشتر ناموفق بود. دوباره تلاش کنید.
        </p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw className="size-4 text-destructive" />
          تلاش دوباره
        </Button>
      </div>
    )
  }

  return null
}

function TableRowSpacer({
  height,
  columns,
}: {
  height: number
  columns: number
}) {
  return (
    <tr data-slot="table-row-spacer" aria-hidden="true" style={{ height }}>
      <td colSpan={columns} style={{ padding: 0 }} />
    </tr>
  )
}

const DocumentTableRow = memo(function DocumentTableRow({
  document,
  index,
  measureElement,
  isSelecting,
  isSelected,
  onToggleSelected,
}: {
  document: DocumentRecord
  index: number
  measureElement: (node: HTMLTableRowElement | null) => void
  isSelecting: boolean
  isSelected: boolean
  onToggleSelected: (id: number) => void
}) {
  return (
    <TableRow
      data-index={index}
      data-state={isSelected ? 'selected' : undefined}
      ref={measureElement}
    >
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
