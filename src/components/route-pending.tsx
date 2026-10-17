import { LoaderCircle } from 'lucide-react'

function RoutePending() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className="flex h-full min-h-32 items-center justify-center"
    >
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  )
}

export { RoutePending }
