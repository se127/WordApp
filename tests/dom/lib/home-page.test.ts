import { readHomePage, saveHomePage } from '@/lib/home-page'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  saveHomePage(1)
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
})
