import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const pool = 'threads' as const

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
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
    coverage: {
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts', 'scripts/**/*.ts'],
      exclude: ['src/components/ui/**', 'src/types/**', 'src/lib/utils.ts'],
      reporter: [['text', { skipFull: false }], 'html'],
    },
  },
})
