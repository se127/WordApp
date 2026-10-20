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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/number'
import {
  documentQuery,
  documentsCountQuery,
  invalidateDocumentPagesFrom,
} from '@/lib/query'
import { cn } from '@/lib/utils'
import { useQueryClient } from '@tanstack/react-query'
import { ListChecks, LoaderCircle, Trash } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

const toggleSelectionLabel = 'انتخاب گروهی اسناد'

function DocumentsSelectionToolbar({
  isSelecting,
  selectedIds,
  onToggleSelecting,
  onDocumentsDeleted,
  isDisabled,
}: {
  isSelecting: boolean
  selectedIds: ReadonlySet<number>
  onToggleSelecting: () => void
  onDocumentsDeleted: () => void
  isDisabled: boolean
}) {
  const queryClient = useQueryClient()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const selectedCount = selectedIds.size

  const deleteSelectedDocuments = async (): Promise<void> => {
    setIsDeleting(true)
    await (async () => {
      const ids = [...selectedIds]
      const deleted = await window.WordApp?.documents.deleteMany(ids).then(
        () => true,
        () => {
          toast.error('حذف اسناد ناموفق بود. دوباره تلاش کنید.')
          return false
        },
      )
      if (!deleted) {
        return
      }

      toast.success(`${formatNumber(ids.length)} سند حذف شد.`)
      setIsDeleteDialogOpen(false)

      void queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })
      invalidateDocumentPagesFrom(queryClient, 1)

      onDocumentsDeleted()

      for (const id of ids) {
        queryClient.removeQueries({ queryKey: documentQuery(id).queryKey })
      }
    })().finally(() => {
      setIsDeleting(false)
    })
  }

  return (
    <>
      <div className="flex items-center gap-2 pt-2 pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={toggleSelectionLabel}
              aria-pressed={isSelecting}
              disabled={isDisabled}
              onClick={onToggleSelecting}
            >
              <ListChecks
                className={cn(isSelecting && 'text-sidebar-primary')}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{toggleSelectionLabel}</TooltipContent>
        </Tooltip>

        {selectedCount > 0 ? (
          <Button
            variant="destructive"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash />
            {`حذف اسناد انتخاب شده (${formatNumber(selectedCount)})`}
          </Button>
        ) : null}
      </div>

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
              {`آیا مطمئن هستید که می خواهید ${formatNumber(selectedCount)} سند انتخاب شده را حذف کنید؟`}
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
                void deleteSelectedDocuments()
              }}
            >
              {isDeleting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
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

export { DocumentsSelectionToolbar }
