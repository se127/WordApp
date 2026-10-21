import { TitleBar } from '@/components/title-bar'
import { Toaster } from '@/components/ui/sonner'
import { listenForClose } from '@/lib/close-handshake'
import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'

function AppShell() {
  useEffect(() => listenForClose(), [])

  return (
    <div className="flex h-screen flex-col bg-emerald-50 dark:bg-zinc-900">
      <TitleBar />

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

export { AppShell }
