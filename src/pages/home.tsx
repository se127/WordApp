import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { documentsCountQuery } from '@/lib/query'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// Home page. The title carries the document count from the documents-count
// query, read inline: the route's loader starts the read without waiting (see
// src/routes/home.ts), so the whole page renders immediately. Until a count
// has loaded once, the number's spot shows a loader; when a write invalidates
// the count (creating a document, below), the stale number stays on screen
// and pulses until the fresh one arrives; when the read fails, the number's
// spot shows a retry button instead. The button stores a fresh untitled
// document and opens that document's page; while the store is busy the button
// is disabled and swaps the plus for a spinning loader with its own label, so
// a slow write (e.g. under the dev script's --db-delay) is visible. A write
// the store refuses raises the error toast (the shell hosts the toaster in
// src/components/app-shell.tsx) and leaves the page where it was.
function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)

  const addDocument = async (): Promise<void> => {
    setIsCreating(true)
    try {
      // The store refused the write — a locked database, or the dev script's
      // --with-db-failure exercising this path: tell the user with a toast
      // that the create failed and to try again, instead of letting the click
      // fail silently.
      const document = await window.WordApp?.documents.create().catch(() => {
        toast.error('افزودن سند ناموفق بود. دوباره تلاش کنید.')
        return undefined
      })
      if (!document) {
        return
      }

      // The new document changes the stored count. Invalidate it so the next
      // read asks the database again; not awaited, because opening the new
      // document should not wait on the re-read (which also keeps running
      // after the home page is gone).
      void queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })

      await navigate({
        to: '/documents/$documentId',
        params: { documentId: String(document.id) },
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-start gap-3 p-6">
      {/* The heading line keeps one height in every state — h-8 is text-2xl's
          line height — so the count's spot may swap between the number, the
          loader, and the taller retry button without moving the heading or
          the button under it. */}
      <h1 className="flex h-8 items-center gap-1.5 text-2xl font-semibold">
        {'مستندات '}
        <DocumentCount />
      </h1>
      <Button disabled={isCreating} onClick={addDocument}>
        {isCreating ? (
          <>
            <LoaderCircle className="animate-spin" />
            در حال ساخت سند...
          </>
        ) : (
          <>
            <Plus />
            افزودن سند
          </>
        )}
      </Button>
    </div>
  )
}

// The stored-document count, inside the heading's parentheses. The number's
// spot shows whichever of three things owns it: the loader while no count has
// been read (the first load, or a retry read with nothing to show yet); the
// number once one has, pulsing when the count is invalidated and read again
// after a document is created, so the stale number stays on screen until the
// fresh one arrives; the retry button when the last read failed (e.g. under
// the dev script's --with-db-failure), so the user can ask for the count
// again.
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
      ({documentCount})
    </span>
  )
}

// The retry button that replaces the number when the count read failed: an
// outline icon button whose icon is destructive-colored in both themes — on
// hover too, where the outline variant would otherwise flip it to the
// foreground color — with the retry explained by the tooltip (the button
// carries the same text as its accessible name). While the re-read it starts
// is in flight it is disabled with its icon spinning, so a slow retry stays
// visible; this is what the number's spot shows when a stale count was still
// known, while a retry with no count yet hands the spot back to the loader
// (see DocumentCount above).
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
          <RefreshCw className={isRetrying ? 'animate-spin' : undefined} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{retryLabel}</TooltipContent>
    </Tooltip>
  )
}

// The loader that holds the count's spot until a number has been read (a
// route-wide pending spinner never applies to the home page).
function CountPending() {
  return (
    <LoaderCircle
      role="status"
      aria-label="در حال بارگذاری"
      className="size-5 animate-spin text-black dark:text-white"
    />
  )
}

export { HomePage }
