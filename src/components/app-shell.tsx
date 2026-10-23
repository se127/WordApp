import { Toaster } from '@/components/ui/sonner'
import { listenForClose, registerCloseSave } from '@/lib/close-handshake'
import { retryRememberedDocumentChanges } from '@/lib/document-recovery'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

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

  return (
    <div className="flex h-screen flex-col bg-white p-6 dark:bg-zinc-900">
      <main className="min-h-0 flex-1">
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

export { AppShell }
