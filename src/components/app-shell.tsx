import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import {
  flushDocumentSaves,
  isDocumentSaving,
  listenForClose,
  subscribeToDocumentSaves,
} from '@/lib/close-handshake'
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from 'react'

function AppShell() {
  useEffect(() => listenForClose(), [])
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isDocumentPage = pathname.startsWith('/documents/')

  return (
    <div className="flex h-screen flex-col bg-emerald-50 dark:bg-zinc-900">
      <TitleBar trailing={isDocumentPage ? <DocumentBackLink /> : undefined} />

      <main className="mx-4 mb-4 min-h-0 flex-1 rounded-lg border border-border bg-white dark:border-input dark:bg-zinc-800">
        <Outlet />
      </main>
      <Toaster
        position="bottom-left"
        duration={8000}
        expand
        className="toaster group pointer-events-auto font-sans"
        closeButton
      />
    </div>
  )
}

function DocumentBackLink() {
  const navigate = useNavigate()
  const [isLeaving, setIsLeaving] = useState(false)
  const isSaving = useSyncExternalStore(
    subscribeToDocumentSaves,
    isDocumentSaving,
  )

  const openDocuments = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault()

    if (isSaving || isLeaving) {
      return
    }

    setIsLeaving(true)
    void flushDocumentSaves().then(() => navigate({ to: '/', replace: true }))
  }

  if (isSaving || isLeaving) {
    return (
      <Button variant="outline" dir="rtl" disabled>
        <ArrowRight />
        بازگشت به مستندات
      </Button>
    )
  }

  return (
    <Button variant="outline" asChild>
      <Link to="/" replace dir="rtl" onClick={openDocuments}>
        <ArrowRight />
        بازگشت به مستندات
      </Link>
    </Button>
  )
}

export { AppShell }
