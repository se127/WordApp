import { describe, expect, it } from 'vitest'
import {
  formatDevFlags,
  formatOperationLabel,
} from '../../scripts/dev-flags.ts'

describe('formatDevFlags', () => {
  it('marks the always active seed and db delay flags and only db failure as off by default', () => {
    expect(
      formatDevFlags({
        seedEntries: [{ table: 'documents', count: 0 }],
        dbDelayMs: 0,
      }),
    ).toBe(
      '✅ seed:\n  - documents: 0\n\n✅ db delay: 0ms\n\n❌ with db failure',
    )
  })

  it('lists the seeded tables in lowercase with their record counts', () => {
    expect(
      formatDevFlags({
        seedEntries: [{ table: 'documents', count: 10 }],
        dbDelayMs: 0,
      }),
    ).toBe(
      '✅ seed:\n  - documents: 10\n\n✅ db delay: 0ms\n\n❌ with db failure',
    )
  })

  it('shows the delay right on the db delay flag without a detail line', () => {
    expect(
      formatDevFlags({
        seedEntries: [{ table: 'documents', count: 0 }],
        dbDelayMs: 2000,
      }),
    ).toBe(
      '✅ seed:\n  - documents: 0\n\n✅ db delay: 2000ms\n\n❌ with db failure',
    )
  })

  it('lists the picked failing operations in lowercase words', () => {
    expect(
      formatDevFlags({
        seedEntries: [{ table: 'documents', count: 0 }],
        dbDelayMs: 0,
        failingOperations: ['createDocument', 'saveDocument'],
      }),
    ).toBe(
      '✅ seed:\n  - documents: 0\n\n✅ db delay: 0ms\n\n✅ with db failure:\n  - create document\n  - save document',
    )
  })

  it('shows - none under a used db failure flag with an empty pick', () => {
    expect(
      formatDevFlags({
        seedEntries: [{ table: 'documents', count: 0 }],
        dbDelayMs: 0,
        failingOperations: [],
      }),
    ).toBe(
      '✅ seed:\n  - documents: 0\n\n✅ db delay: 0ms\n\n✅ with db failure:\n  - none',
    )
  })

  it('separates every flag block from the next flag with a blank line', () => {
    expect(
      formatDevFlags({
        seedEntries: [{ table: 'documents', count: 3 }],
        dbDelayMs: 2000,
        failingOperations: ['deleteDocument'],
      }),
    ).toBe(
      '✅ seed:\n  - documents: 3\n\n✅ db delay: 2000ms\n\n✅ with db failure:\n  - delete document',
    )
  })
})

describe('formatOperationLabel', () => {
  it('lowercases every camel case word of an operation name', () => {
    expect(
      [
        formatOperationLabel('createDocument'),
        formatOperationLabel('getDocument'),
        formatOperationLabel('countDocuments'),
        formatOperationLabel('listDocuments'),
        formatOperationLabel('listMoreDocuments'),
        formatOperationLabel('deleteDocument'),
        formatOperationLabel('saveDocument'),
      ].join(', '),
    ).toBe(
      'create document, get document, count documents, list documents, list more documents, delete document, save document',
    )
  })
})
