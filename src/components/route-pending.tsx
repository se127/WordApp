import { LoaderCircle } from 'lucide-react'

// Shown in a route's place while it waits on data — the router's default
// pending component (src/router.ts; its pending times are zero, so it would
// appear the moment a loader started waiting). The app's routes do not hold
// their pages back on a read — each page shows its own loading state, the
// document page keeping its back button on screen through a slow one (e.g.
// under the dev script's --db-delay) — so this is the fallback rather than
// the everyday path: a loader that did wait, or a suspended page component,
// lands here instead of a blank route.
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
