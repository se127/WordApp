import { Button } from '@/components/ui/button'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'

function RouteError({ reset }: ErrorComponentProps) {
  return (
    <div className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-destructive">
        نمایش این صفحه ناموفق بود. دوباره تلاش کنید.
      </p>
      <Button variant="outline" onClick={reset}>
        <RefreshCw className="size-4 text-destructive" />
        تلاش دوباره
      </Button>
    </div>
  )
}

export { RouteError }
