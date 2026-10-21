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
import {
  documentQuery,
  documentsCountQuery,
  documentsQueryKey,
} from '@/lib/query'
import { useQueryClient } from '@tanstack/react-query'
import { Ellipsis, LoaderCircle, Trash } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

function DocumentOptions({
  documentId,
  documentTitle,
  onDocumentDeleted,
}: {
  documentId: number
  documentTitle?: string
  onDocumentDeleted?: () => Promise<void> | void
}) {
  const queryClient = useQueryClient()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const deleteDocument = async (): Promise<void> => {
    setIsDeleting(true)
    await (async () => {
      const bridge = window.WordApp
      if (bridge === undefined) {
        toast.error('حذف سند ناموفق بود. دوباره تلاش کنید.')
        return
      }

      const deleted = await bridge.documents.delete(documentId).then(
        () => true,
        () => {
          toast.error('حذف سند ناموفق بود. دوباره تلاش کنید.')
          return false
        },
      )
      if (!deleted) {
        return
      }

      toast.success('سند حذف شد.')
      setIsDeleteDialogOpen(false)

      void queryClient.invalidateQueries({
        queryKey: documentsCountQuery.queryKey,
      })
      void queryClient.invalidateQueries({ queryKey: documentsQueryKey })

      await onDocumentDeleted?.()

      queryClient.removeQueries({
        queryKey: documentQuery(documentId).queryKey,
      })
    })().finally(() => {
      setIsDeleting(false)
    })
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="گزینه ها">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>گزینه ها</TooltipContent>
        </Tooltip>

        <DropdownMenuContent side="bottom" align="end">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setIsDeleteDialogOpen(true)}
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
            if (isDeleting) {
              event.preventDefault()
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {documentTitle === undefined
                ? 'آیا مطمئن هستید که می خواهید این سند را حذف کنید؟'
                : `آیا مطمئن هستید که می خواهید سند «${documentTitle}» را حذف کنید؟`}
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
                void deleteDocument()
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

export { DocumentOptions }
