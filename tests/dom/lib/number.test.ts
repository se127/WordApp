import { formatNumber } from '@/lib/number'
import { describe, expect, it } from 'vitest'

describe('formatNumber', () => {
  it('groups thousands for numbers that reach four digits', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(3000)).toBe('3,000')
    expect(formatNumber(999_999)).toBe('999,999')
    expect(formatNumber(1_234_567)).toBe('1,234,567')
  })

  it('leaves numbers under a thousand as they are', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(12)).toBe('12')
    expect(formatNumber(999)).toBe('999')
  })
})
