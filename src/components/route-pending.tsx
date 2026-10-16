import { LoaderCircle } from 'lucide-react'

// Shown in a route's place while it waits on data. The router's pending times
// are zero (src/router.ts), so this appears the moment a loader starts
// waiting — a slow read under the dev script's --db-delay shows a spinner
// instead of a blank page. Suspended page components fall back to it too.
function RoutePending() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className="flex h-full min-h-32 items-center justify-center"
    >
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export { RoutePending }
