import {
  hasDocumentSaveFailed,
  markDocumentSaveFailed,
  markDocumentSaveSucceeded,
} from '@/lib/document-save-state'
import { createQueryClient } from '@/lib/query'
import { describe, expect, it } from 'vitest'

describe('document save state', () => {
  it('tracks failed saves per query client and clears them on success', () => {
    const queryClient = createQueryClient()
    const otherQueryClient = createQueryClient()

    expect(hasDocumentSaveFailed(queryClient, 1)).toBe(false)

    markDocumentSaveFailed(queryClient, 1)
    expect(hasDocumentSaveFailed(queryClient, 1)).toBe(true)
    expect(hasDocumentSaveFailed(otherQueryClient, 1)).toBe(false)

    markDocumentSaveSucceeded(queryClient, 1)
    expect(hasDocumentSaveFailed(queryClient, 1)).toBe(false)
  })
})
