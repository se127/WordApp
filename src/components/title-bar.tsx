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
import { cn } from '@/lib/utils'
import { Link } from '@tanstack/react-router'
import { Copy, House, LoaderCircle, Minus, Plus, Square, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

function TitleBar() {
  const controls = window.WordApp?.windowControls
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const windowControls = window.WordApp?.windowControls
    if (!windowControls) {
      return
    }

    let isActive = true
    const unsubscribe = windowControls.onMaximizedChange(setIsMaximized)
    void windowControls.isMaximized().then((value) => {
      if (isActive) {
        setIsMaximized(value)
      }
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  return (
    <div
      dir="ltr"
      className="flex h-16 shrink-0 items-center select-none drag-region"
    >
      <div className="flex h-full shrink-0 items-center gap-3 ps-4 no-drag-region">
        <ThemePicker />
        <span className="text-sm font-medium text-black dark:text-white">
          WordApp
        </span>
      </div>
      <DocumentTabs />
      <div className="flex h-full shrink-0 items-center justify-end">
        <AddDocumentButton />
        <Separator orientation="vertical" className="my-auto me-3 h-8" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              asChild
              aria-label="خانه"
              className="me-3 no-drag-region"
            >
              <Link to="/">
                <House />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">خانه</TooltipContent>
        </Tooltip>
        <WindowButton
          label="کوچک کردن"
          onClick={() => void controls?.minimize()}
        >
          <Minus />
        </WindowButton>
        <WindowButton
          label={isMaximized ? 'بازگرداندن' : 'تمام صفحه'}
          onClick={() => void controls?.toggleMaximize()}
        >
          {isMaximized ? <Copy className="rotate-90" /> : <Square />}
        </WindowButton>
        <WindowButton
          label="بستن"
          isClose
          onClick={() => void controls?.close()}
        >
          <X />
        </WindowButton>
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
          className="me-3 no-drag-region"
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

function WindowButton({
  label,
  isClose = false,
  onClick,
  children,
}: {
  label: string
  isClose?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          className={cn(
            'grid h-full w-12 cursor-default place-items-center text-foreground/90 transition-colors outline-none no-drag-region [&_svg]:pointer-events-none [&_svg]:size-4',
            'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
            isClose
              ? 'hover:bg-red-600 hover:text-white'
              : 'hover:bg-black/10 dark:hover:bg-white/10',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export { TitleBar }
