import { DocumentTabs } from '@/components/document-tabs'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ThemePicker } from '@/components/theme-picker'
import { useCreateDocument } from '@/lib/documents'
import { Link } from '@tanstack/react-router'
import { House, LoaderCircle, Plus } from 'lucide-react'

function TitleBar() {
  return (
    <div
      dir="ltr"
      data-slot="title-bar"
      className="flex h-16 shrink-0 items-center select-none"
    >
      <div className="flex h-full shrink-0 items-center ps-4">
        <ThemePicker />
      </div>
      <DocumentTabs />
      <div className="flex h-full shrink-0 items-center justify-end pe-4">
        <AddDocumentButton />
        <Separator orientation="vertical" className="my-auto me-3 h-8" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" asChild aria-label="خانه">
              <Link to="/">
                <House />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">خانه</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function AddDocumentButton() {
  const { createDocument, isCreating } = useCreateDocument()
  const label = isCreating ? 'در حال ساخت سند...' : 'افزودن سند'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={label}
          className="me-3"
          disabled={isCreating}
          onClick={() => void createDocument()}
        >
          {isCreating ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export { TitleBar }
