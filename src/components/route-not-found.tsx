import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

function RouteNotFound() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TitleBar />
      <div className="flex min-h-32 w-full flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm">صفحه ی مورد نظر پیدا نشد.</p>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowRight />
            بازگشت به مستندات
          </Link>
        </Button>
      </div>
    </div>
  )
}

export { RouteNotFound }
