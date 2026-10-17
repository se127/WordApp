import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { documentQuery } from '@/lib/query'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react'

const documentRouteApi = getRouteApi('/documents/$documentId')

// One document's page. The route's loader has read the row into the query
// cache; the component reads it back with useQuery. The row stays fresh until
// a write invalidates it (src/lib/query.ts), so revisiting the document
// reuses the cached row instead of reading again. A read the store refuses
// (e.g. under the dev script's --with-db-failure) shows the failed report and
// the retry button in the content box; the back button stays, so the page is
// never a dead end.
function DocumentPage() {
  const { documentId } = documentRouteApi.useParams()
  const {
    data: document,
    isError,
    refetch,
  } = useQuery(documentQuery(Number(documentId)))

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      {/* The document's title and the back button to the documents list share
          the top line, anchored to the right (the start of the RTL layout);
          in this direction "back" points right. */}
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" asChild>
              <Link to="/" aria-label="بازگشت به مستندات">
                <ArrowRight />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>بازگشت به مستندات</TooltipContent>
        </Tooltip>

        {document ? (
          <h1 className="min-w-0 truncate text-2xl font-semibold">
            {document.title}
          </h1>
        ) : null}
      </div>

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

// What the content box shows when the read failed: the failure spelled out —
// with no technical detail — and the retry button that takes the read again.
// The button is an outline icon button whose icon is destructive-colored in
// both themes, on hover too, where the outline variant would otherwise flip
// it to the foreground color, with the retry explained by the tooltip (the
// button carries the same text as its accessible name). The retry runs with
// no row on screen, so it hands the box back to the pending spinner (see
// DocumentPending below) while its read runs.
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

// The loader that holds the content box while a retry's read runs. The
// route's own pending spinner covers a first read — the loader waits for it —
// so by the time the page renders, the first read has settled; only a retry
// starts a read the route knows nothing about.
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
