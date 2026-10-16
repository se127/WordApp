import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getRouteApi, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

const documentRouteApi = getRouteApi('/documents/$documentId')

// One document's page. The loader reads the row from the SQLite database
// through the preload bridge; the router's default stale time of zero makes
// every visit read it fresh.
function DocumentPage() {
  const document = documentRouteApi.useLoaderData()

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
