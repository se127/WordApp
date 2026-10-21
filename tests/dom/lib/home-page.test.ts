import {
  clearHomeScrollPosition,
  readHomeOrder,
  readHomePage,
  readHomeScrollPosition,
  readHomeSearch,
  resetHomeBrowseState,
  saveHomeOrder,
  saveHomePage,
  saveHomeScrollPosition,
  saveHomeSearch,
} from '@/lib/home-page'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  saveHomePage(1)
  saveHomeOrder('newest')
  saveHomeSearch('')
  clearHomeScrollPosition()
})

describe('home page memory', () => {
  it('starts on the first page', () => {
    expect(readHomePage()).toBe(1)
  })

  it('saves the latest page and reads it back', () => {
    saveHomePage(3)
    expect(readHomePage()).toBe(3)

    saveHomePage(7)
    expect(readHomePage()).toBe(7)
  })

  it('resets the page, filters, and scroll position after a document is created', () => {
    saveHomePage(4)
    saveHomeOrder('oldest')
    saveHomeSearch('گزارش')
    saveHomeScrollPosition({ page: 4, scrollTop: 420 })

    resetHomeBrowseState()

    expect(readHomePage()).toBe(1)
    expect(readHomeOrder()).toBe('newest')
    expect(readHomeSearch()).toBe('')
    expect(readHomeScrollPosition()).toBeNull()
  })

  it('starts with the newest documents first', () => {
    expect(readHomeOrder()).toBe('newest')
  })

  it('saves the chosen order and reads it back', () => {
    saveHomeOrder('oldest')
    expect(readHomeOrder()).toBe('oldest')

    saveHomeOrder('newest')
    expect(readHomeOrder()).toBe('newest')
  })

  it('starts without a title search', () => {
    expect(readHomeSearch()).toBe('')
  })

  it('saves the title search and reads it back', () => {
    saveHomeSearch('گزارش')
    expect(readHomeSearch()).toBe('گزارش')

    saveHomeSearch('')
    expect(readHomeSearch()).toBe('')
  })

  it('starts without a saved scroll position', () => {
    expect(readHomeScrollPosition()).toBeNull()
  })

  it('saves the page and scroll position and clears them', () => {
    saveHomeScrollPosition({ page: 4, scrollTop: 420 })

    expect(readHomeScrollPosition()).toEqual({ page: 4, scrollTop: 420 })

    clearHomeScrollPosition()

    expect(readHomeScrollPosition()).toBeNull()
  })
})
