import { paginationEntries } from '@/lib/pagination'
import { describe, expect, it } from 'vitest'

describe('paginationEntries', () => {
  it('shows every page when they all fit', () => {
    expect(paginationEntries(1, 1)).toEqual([1])
    expect(paginationEntries(1, 4)).toEqual([1, 2, 3, 4])
  })

  it('shows three pages after the first page', () => {
    expect(paginationEntries(1, 10)).toEqual([1, 2, 3, 4, 'end-ellipsis', 10])
  })

  it('shows three pages before and after a middle page', () => {
    expect(paginationEntries(10, 20)).toEqual([
      1,
      'start-ellipsis',
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      'end-ellipsis',
      20,
    ])
  })

  it('shows three pages before the last page', () => {
    expect(paginationEntries(20, 20)).toEqual([
      1,
      'start-ellipsis',
      17,
      18,
      19,
      20,
    ])
  })

  it('never repeats the first or last page next to an ellipsis', () => {
    expect(paginationEntries(2, 10)).toEqual([
      1,
      2,
      3,
      4,
      5,
      'end-ellipsis',
      10,
    ])
    expect(paginationEntries(9, 10)).toEqual([
      1,
      'start-ellipsis',
      6,
      7,
      8,
      9,
      10,
    ])
  })
})
