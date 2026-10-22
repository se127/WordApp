import { applyDocumentChanges } from '@/lib/document-cache'
import {
  createQueryClient,
  documentQuery,
  documentsQuery,
  documentsQueryKey,
} from '@/lib/query'
import type { DocumentRecord } from '@/types/global'
import { describe, expect, it, vi } from 'vitest'

const firstDocument: DocumentRecord = {
  id: 1,
  title: 'اول',
  body: '<p>اول</p>',
  createdAt: 1_000,
  updatedAt: 1_000,
}

const secondDocument: DocumentRecord = {
  id: 2,
  title: 'دوم',
  body: '<p>دوم</p>',
  createdAt: 2_000,
  updatedAt: 2_000,
}

describe('applyDocumentChanges', () => {
  it('patches the document query and every cached list page', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(documentQuery(1).queryKey, firstDocument)
    queryClient.setQueryData(documentsQuery(1).queryKey, [
      firstDocument,
      secondDocument,
    ])
    queryClient.setQueryData(documentsQuery(2).queryKey, [
      secondDocument,
      firstDocument,
    ])

    applyDocumentChanges(queryClient, 1, {
      title: 'گزارش',
      body: '<p>تازه</p>',
    })

    const changedDocument = {
      ...firstDocument,
      title: 'گزارش',
      body: '<p>تازه</p>',
    }

    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toEqual(
      changedDocument,
    )
    expect(queryClient.getQueryData(documentsQuery(1).queryKey)).toEqual([
      changedDocument,
      secondDocument,
    ])
    expect(queryClient.getQueryData(documentsQuery(2).queryKey)).toEqual([
      secondDocument,
      changedDocument,
    ])
  })

  it('keeps a fresh list that already contains the document without another read', async () => {
    const queryClient = createQueryClient()
    await queryClient.fetchQuery({
      ...documentsQuery(1),
      queryFn: async () => [firstDocument],
    })

    applyDocumentChanges(queryClient, 1, { title: 'گزارش' })

    expect(queryClient.getQueryData(documentsQuery(1).queryKey)).toEqual([
      { ...firstDocument, title: 'گزارش' },
    ])
    expect(
      queryClient.getQueryState(documentsQuery(1).queryKey)?.isInvalidated,
    ).toBe(false)
  })

  it('re-reads a list that does not contain the patched document', async () => {
    const queryClient = createQueryClient()
    await queryClient.fetchQuery({
      ...documentsQuery(1),
      queryFn: async () => [],
    })
    void queryClient.invalidateQueries({
      queryKey: documentsQueryKey,
      refetchType: 'none',
    })

    applyDocumentChanges(queryClient, 1, { title: 'گزارش' })

    expect(
      queryClient.getQueryState(documentsQuery(1).queryKey)?.isInvalidated,
    ).toBe(true)

    const queryFn = vi.fn(async () => [firstDocument])
    const documents = await queryClient.query({
      ...documentsQuery(1),
      queryFn,
    })

    expect(queryFn).toHaveBeenCalledOnce()
    expect(documents).toEqual([firstDocument])
  })

  it('leaves a list that does not contain the document unchanged', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(documentQuery(1).queryKey, null)
    queryClient.setQueryData(documentsQuery(1).queryKey, [secondDocument])

    applyDocumentChanges(queryClient, 1, { title: 'گزارش' })

    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toBeNull()
    expect(queryClient.getQueryData(documentsQuery(1).queryKey)).toEqual([
      secondDocument,
    ])
  })

  it('applies title-only and body-only changes without clearing the other field', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(documentQuery(1).queryKey, firstDocument)

    applyDocumentChanges(queryClient, 1, { title: 'گزارش' })
    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toEqual({
      ...firstDocument,
      title: 'گزارش',
    })

    applyDocumentChanges(queryClient, 1, { body: '<p>تازه</p>' })
    expect(queryClient.getQueryData(documentQuery(1).queryKey)).toEqual({
      ...firstDocument,
      title: 'گزارش',
      body: '<p>تازه</p>',
    })
  })
})
