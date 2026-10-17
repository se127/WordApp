import { ThemePicker } from '@/components/theme-picker'
import { Toaster } from '@/components/ui/sonner'
import { Outlet } from '@tanstack/react-router'

// Shell around every page: the window strip with the theme picker, the content
// box the routed pages render into, and the app's toast host (sonner): toasts
// sit at the bottom left, stay for 8 seconds, and expand on hover. Pages raise
// toasts through src/pages/home.tsx, the failed-create report.
function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-emerald-50 dark:bg-zinc-900">
      {/* Window strip above the content box. The window keeps its native title
          bar (electron/main.ts), so the strip is not a drag zone: it only
          hosts the theme picker, which the RTL row packs against its end —
          the left edge — 16px from the top and the sides. The gap over the
          content area below the strip is a margin. */}
      <header className="mb-4 flex shrink-0 items-center justify-end px-4 pt-4">
        <ThemePicker />
      </header>
      {/* Main content area: fills the window under the strip and is inset
          16px from the bottom, right, and left, with the buttons' radius. */}
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
