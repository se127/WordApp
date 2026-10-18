import { LoaderCircle } from 'lucide-react'

function RoutePending() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className="flex h-full min-h-32 items-center justify-center gap-2 text-sm"
    >
      <LoaderCircle className="size-4 animate-spin" />
      در حال بارگذاری...
    </div>
  )
}

export { RoutePending }
