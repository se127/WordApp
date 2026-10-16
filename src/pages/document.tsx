import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { documentQuery } from '@/lib/query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

const documentRouteApi = getRouteApi('/documents/$documentId')

// One document's page. The route's loader has read the row into the query
// cache; the component reads it back with useSuspenseQuery. The row stays
// fresh until a write invalidates it (src/lib/query.ts), so revisiting the
// document reuses the cached row instead of reading again.
function DocumentPage() {
  const { documentId } = documentRouteApi.useParams()
  const { data: document } = useSuspenseQuery(documentQuery(Number(documentId)))

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

      {document?.body ? (
        <p className="text-sm whitespace-pre-wrap">{document.body}</p>
      ) : null}
    </div>
  )
}

export { DocumentPage }
