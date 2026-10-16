import { Button } from '@/components/ui/button'
import { documentsCountQuery } from '@/lib/query'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, Plus } from 'lucide-react'
import { Suspense, useState } from 'react'

// Home page. The title carries the document count from the documents-count
// query, read inline: the route's loader starts the read without waiting (see
// src/routes/home.ts), so the whole page renders immediately. Until a count
// has loaded once, the number's spot shows a loader; when a write invalidates
// the count (creating a document, below), the stale number stays on screen
// and pulses until the fresh one arrives. The button stores a fresh untitled
// document and opens that document's page; while the store is busy the button
// is disabled and swaps the plus for a spinning loader with its own label, so
// a slow write (e.g. under the dev script's --db-delay) is visible.
function HomePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isCreating, setIsCreating] = useState(false)

  const addDocument = async (): Promise<void> => {
    setIsCreating(true)
    try {
      const document = await window.WordApp?.documents.create()
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
      <h1 className="text-2xl font-semibold">
        {'مستندات '}
        <Suspense fallback={<CountPending />}>
          <DocumentCount />
        </Suspense>
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

// The stored-document count, inside the heading's parentheses. With no cached
// count yet (the first load) the Suspense fallback holds the loader; when the
// count is invalidated and read again (after a document is created), the
// previous number stays visible and pulses until the fresh one arrives.
function DocumentCount() {
  const { data: documentCount, isFetching } =
    useSuspenseQuery(documentsCountQuery)

  if (documentCount === null) {
    return null
  }

  return (
    <span className={isFetching ? 'animate-pulse' : undefined}>
      ({documentCount})
    </span>
  )
}

// The heading's inline loader (a route-wide pending spinner never applies to
// the home page).
function CountPending() {
  return (
    <LoaderCircle
      role="status"
      aria-label="در حال بارگذاری"
      className="inline size-5 animate-spin align-middle text-muted-foreground"
    />
  )
}

export { HomePage }
