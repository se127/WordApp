import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'

// Caption buttons of the frameless window. The document is RTL, so the first
// button renders in the top-right corner: close sits in the corner and
// minimize is the leftmost of the three, like the Windows caption bar.
function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const controls = window.WordApp?.windowControls
    if (!controls) {
      return
    }

    // Subscribe before querying: the state may have changed before this
    // component mounted (the main process maximizes the window before showing
    // it), so ask for the current state once and stay in sync from then on.
    const unsubscribe = controls.onMaximizedChange(setMaximized)
    void controls.isMaximized().then(setMaximized)
    return unsubscribe
  }, [])

  return (
    <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="white"
            size="icon"
            aria-label="بستن"
            className="text-destructive hover:text-destructive"
            onClick={() => window.WordApp?.windowControls.close()}
          >
            <X />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">بستن</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="white"
            size="icon"
            aria-label={maximized ? 'بازگرداندن' : 'تمام صفحه'}
            onClick={() => window.WordApp?.windowControls.toggleMaximize()}
          >
            {maximized ? <Copy /> : <Square />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {maximized ? 'بازگرداندن' : 'تمام صفحه'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="white"
            size="icon"
            aria-label="کوچک کردن"
            onClick={() => window.WordApp?.windowControls.minimize()}
          >
            <Minus />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">کوچک کردن</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { WindowControls }
