import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Vitest setup, deliberately separate from vite.config.ts: tests do not need
// the Tailwind or React Compiler passes, and skipping them keeps runs fast.
// Forks re-spawn a fresh Bun process per worker, which costs seconds per run
// here; the threads pool starts in milliseconds. Isolation stays on, so every
// test file still gets a clean environment and module registry.
const pool = 'threads' as const

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Tests are split by runtime and each project runs in the leanest
    // environment it can: happy-dom only for the renderer, bare Node for the
    // Electron main/preload code. Inline projects inherit this config
    // (`extends` defaults to true) and do not redefine Vite-level options, so
    // both share this Vite server and its transform cache.
    projects: [
      {
        test: {
          name: 'dom',
          pool,
          environment: 'happy-dom',
          include: ['tests/dom/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/dom/setup.ts'],
        },
      },
      {
        test: {
          name: 'node',
          pool,
          environment: 'node',
          include: ['tests/node/**/*.test.ts'],
        },
      },
    ],
    // Coverage is opt-in (`bun run test:coverage`); the regular test run stays
    // lean. `include` covers every app source file, so code no test touches
    // still shows up, as a 0% row instead of silently missing from the report.
    coverage: {
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts', 'scripts/**/*.ts'],
      // Vendored shadcn components, type-only files, and the pure re-export
      // of the third-party `cn` package are not app behavior.
      exclude: ['src/components/ui/**', 'src/types/**', 'src/lib/utils.ts'],
      // Under an agent/CI, Vitest 5 force-hides fully covered files from the
      // `text` table, which reads as if files were missing from the report.
      // Reporter-level options win over that forced default, so set it here.
      reporter: [['text', { skipFull: false }], 'html'],
    },
  },
})
