import {
  clearHomeScrollPosition,
  readHomeOrder,
  readHomePage,
  readHomeScrollPosition,
  saveHomeOrder,
  saveHomePage,
  saveHomeScrollPosition,
} from '@/lib/home-page'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  saveHomePage(1)
  saveHomeOrder('newest')
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

  it('starts again from the first page after a document is created', () => {
    saveHomePage(4)

    saveHomePage(1)

    expect(readHomePage()).toBe(1)
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
