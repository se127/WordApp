import { ThemePicker } from '@/components/theme-picker'
import { Toaster } from '@/components/ui/sonner'
import { Outlet } from '@tanstack/react-router'

function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-emerald-50 dark:bg-zinc-900">
      <header className="mb-4 flex shrink-0 items-center justify-end px-4 pt-4">
        <ThemePicker />
      </header>

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
