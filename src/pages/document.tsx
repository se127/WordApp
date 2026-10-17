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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Ellipsis,
  LoaderCircle,
  RefreshCw,
  Trash,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
          in this direction "back" points right. The options menu (the
          document's delete, below) sits at the far end — the left. */}
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

        <DocumentOptions documentId={Number(documentId)} />
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

// The document's options menu, at the far end of the top line (the left in
// the RTL layout): an outline ellipsis button labelled by its tooltip, opening
// a dropdown that holds the document's actions — for now just حذف. Picking
// the delete item opens an alert dialog asking to confirm it; the item holds
// the menu open under the dialog (selecting an item would normally close it),
// so dismissing the dialog — انصراف or Esc — drops the user back into the
// menu. Confirming deletes the row through the preload bridge. While the
// write runs the confirm button carries its در حال حذف... pending label
// with a spinner, both dialog buttons are disabled, and Esc is held off, so
// a slow delete (e.g. under the dev script's --db-delay) is visible and can
// neither be started twice nor dismissed by accident. A refused write (e.g.
// under --with-db-failure) raises the error toast and leaves the dialog open
// with its buttons ready for another try; a successful one raises the success
// toast, returns home — where the count re-reads — and drops the deleted row
// from the query cache so a later visit reads the database again.
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
        // The store refused the write — a locked database, or the dev
        // script's --with-db-failure exercising this path: tell the user with
        // a toast and leave the dialog open for another try, instead of
        // letting the click fail silently or closing the dialog.
        () => {
          toast.error('حذف سند ناموفق بود. دوباره تلاش کنید.')
          return false
        },
      )
      if (!deleted) {
        return
      }

      toast.success('سند حذف شد')

      // The deleted row changes the stored count. Invalidate it so the next
      // read asks the database again; not awaited, because returning home
      // should not wait on the re-read (which also keeps running after the
      // home page is gone).
      void queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })

      await navigate({ to: '/' })

      // The row is gone from the database; drop the cached copy so a later
      // visit to this id reads again — and finds nothing — instead of
      // showing a deleted document.
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
              // Selecting an item would normally close the menu; hold it open
              // so the confirmation dialog sits over it and dismisses back
              // into it.
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
            // Esc would dismiss the dialog mid-delete, hiding a write that is
            // already on its way; hold it off until the delete settles (the
            // disabled buttons do the same for clicks). The dialog stays
            // dismissible with Esc at every other time.
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
              این عملیات غیر قابل بازگشت است
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>انصراف</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                // The action button would close the dialog as it is clicked;
                // hold it open so the pending label and spinner can show. A
                // success navigates away, a failure keeps the dialog open.
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
