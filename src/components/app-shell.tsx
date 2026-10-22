import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { listenForClose, registerCloseSave } from '@/lib/close-handshake'
import {
  applyDocumentChanges,
  invalidateDocumentListsIfMissing,
} from '@/lib/document-cache'
import { retryRememberedDocumentChanges } from '@/lib/document-recovery'
import { hasDocumentSaveFailed } from '@/lib/document-save-state'
import { pendingDocumentChanges } from '@/lib/pending-changes'
import { useQueryClient } from '@tanstack/react-query'
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useEffect, type MouseEvent } from 'react'

function AppShell() {
  useEffect(() => listenForClose(), [])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  useEffect(
    () =>
      registerCloseSave(() =>
        retryRememberedDocumentChanges(queryClient, (documentId) => {
          void navigate({
            to: '/documents/$documentId',
            params: { documentId: String(documentId) },
          })
        }),
      ),
    [navigate, queryClient],
  )
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
  const queryClient = useQueryClient()

  const openDocuments = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault()

    const pending = pendingDocumentChanges()
    if (pending !== null) {
      if (hasDocumentSaveFailed(queryClient, pending.documentId)) {
        invalidateDocumentListsIfMissing(queryClient, pending.documentId)
      } else {
        applyDocumentChanges(queryClient, pending.documentId, pending.changes)
      }
    }

    void navigate({ to: '/', replace: true })
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
