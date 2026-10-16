import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library registers its own cleanup only when test globals
// exist; this project imports `it`/`expect` explicitly, so clean up by hand.
afterEach(() => {
  cleanup()
})
