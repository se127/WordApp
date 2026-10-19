import {
  clearHomeScrollOffset,
  readHomeMeasurements,
  readHomeScrollOffset,
  resetHomeScrollOffset,
  saveHomeMeasurements,
  saveHomeScrollOffset,
} from '@/lib/home-scroll'
import type { VirtualItem } from '@tanstack/react-virtual'
import { afterEach, describe, expect, it } from 'vitest'

const measuredRow: VirtualItem = {
  key: 1,
  index: 0,
  start: 0,
  size: 64,
  end: 64,
  lane: 0,
}

afterEach(() => {
  clearHomeScrollOffset()
})

describe('home scroll offset', () => {
  it('starts without a saved offset', () => {
    expect(readHomeScrollOffset()).toBeNull()
    expect(readHomeMeasurements()).toEqual([])
  })

  it('saves the latest offset and reads it back', () => {
    saveHomeScrollOffset(1500)
    expect(readHomeScrollOffset()).toBe(1500)

    saveHomeScrollOffset(2960)
    expect(readHomeScrollOffset()).toBe(2960)
  })

  it('saves the measured row sizes and reads them back', () => {
    saveHomeMeasurements([measuredRow])

    expect(readHomeMeasurements()).toEqual([measuredRow])
  })

  it('resets the offset and the measured rows to the top after a document is created', () => {
    saveHomeScrollOffset(1500)
    saveHomeMeasurements([measuredRow])

    resetHomeScrollOffset()

    expect(readHomeScrollOffset()).toBe(0)
    expect(readHomeMeasurements()).toEqual([])
  })

  it('clears the saved offset and measurements', () => {
    saveHomeScrollOffset(1500)
    saveHomeMeasurements([measuredRow])

    clearHomeScrollOffset()

    expect(readHomeScrollOffset()).toBeNull()
    expect(readHomeMeasurements()).toEqual([])
  })
})
