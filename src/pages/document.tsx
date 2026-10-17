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

// One document's page. The route's loader has read the row into the query
// cache; the component reads it back with useQuery. The row stays fresh until
// a write invalidates it (src/lib/query.ts), so revisiting the document
// reuses the cached row instead of reading again. A read the store refuses
// (e.g. under the dev script's --with-db-failure) shows the failed report and
// the retry button in the content box; the back button stays, so the page is
// never a dead end. The title is editable in place (DocumentTitle below),
// and its save goes through the page's shared document save action
// (useDocumentSave), which the body will use too.
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
          <DocumentTitle
            documentId={Number(documentId)}
            title={document.title}
          />
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

// The document's title, editable in place. The heading fills the top line's
// free width at the icon buttons' own height (h-8) and truncates a title too
// long for it; it carries the input's own padding, a matching rounded shape,
// and a border that stays transparent until the heading has focus, so the
// swap between the two never jogs the title. The cursor stays the default
// arrow — text selection is the input's job — and hovering or focusing tints
// it — bg-gray-100 in light, bg-zinc-700 in dark — with a color transition.
// A Tab onto it shows the border (the input's own border color) while it is
// still the heading. Clicking the heading, or pressing Space or Enter while
// it has focus, swaps it for the input: the same text, same height, the same
// border kept, all of it selected, so typing replaces it. Enter inside the
// input commits — the same blur — and hands focus back to the heading, so
// the keyboard stays on the title: another Enter reopens the input and a Tab
// moves on from the heading itself. Blur is the only thing that can save,
// and only when the text changed: typing, and a focus-and-blur that leaves
// the title alone, never call the save action. A
// changed title commits through the page's document save action
// (useDocumentSave below), the one toast a save can raise being the error one
// — successes stay silent. While the write runs the input stays on screen,
// disabled, with a spinner in its end corner — the input pads that side so a
// full title never runs under the spinner — so a slow save (e.g. under the
// dev script's --db-delay) is visible; a refused write (e.g. under --with-db-failure)
// raises the error toast, keeps the typed text, and hands the caret back to
// the input, where the next blur tries the save again.
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
  // The text being edited; null while the heading is shown.
  const [draft, setDraft] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // Set when the input opens, so opening selects the whole title while a
  // failed save only returns the caret to it.
  const selectOnOpen = useRef(false)
  // Set when Enter causes the input's blur, so an edit that ends that way
  // puts focus back on the heading — the keyboard stays on the title, where
  // Enter reopens the input and Tab moves on. A commit started by a click or
  // a Tab leaves it false: focus then belongs where the user put it. A
  // refused save clears it, because the edit continues in the input.
  const returnFocusToHeading = useRef(false)

  const isEditing = draft !== null

  // Focus — and, on opening, select — the input once it is in the DOM: the
  // heading is gone by then, and a failed save brings the caret back here so
  // the next blur retries.
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

  // An edit that ended — saved or left unchanged — returns focus to the
  // heading when Enter ended it, so the next Tab or Enter continues from the
  // title instead of the body.
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
      // The edit goes on, so focus goes back to the input, not the heading.
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
          // Enter commits the way leaving the field does — through the blur —
          // and flags the commit so focus lands back on the heading.
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
      // The mousedown default (focus and text selection) is not wanted here:
      // the click opens the input and hands focus to it instead.
      onMouseDown={(event) => event.preventDefault()}
      onClick={startEditing}
      onKeyDown={(event) => {
        // Space and Enter are the heading's edit keys — like the click — and
        // must not leak on to the input that takes focus in its place.
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

// The page's document save action: every field edit — the title now, the
// body later — goes through this one function. The write lands through the
// preload bridge and the stored row it returns goes into the query cache, so
// the edit shows right away instead of bouncing back to the old text while
// the invalidation's re-read runs (which a slow database, e.g. under the dev
// script's --db-delay, stretches out); the invalidation itself makes the
// next read ask the database again — stale times are infinite, so a missed
// invalidation would leave the UI on the old row. Resolves to whether the
// save landed; a refused write raises the error toast instead, and the
// caller keeps the edited text on screen for another try.
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

      toast.success('سند حذف شد.')

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
              این عملیات غیر قابل بازگشت است.
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
