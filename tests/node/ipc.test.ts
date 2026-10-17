import { describe, expect, it } from 'vitest'
import * as channels from '../../electron/ipc.ts'

describe('IPC channel names', () => {
  it('are unique and namespaced to the app', () => {
    const names = Object.values(channels)

    expect(names.length).toBeGreaterThan(0)
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name.startsWith('wordapp:')).toBe(true)
    }
  })
})
