import { formatNumber } from '@/lib/number'
import { describe, expect, it } from 'vitest'

describe('formatNumber', () => {
  it('groups thousands for numbers that reach four digits', () => {
    expect(formatNumber(1000)).toBe('۱٬۰۰۰')
    expect(formatNumber(3000)).toBe('۳٬۰۰۰')
    expect(formatNumber(999_999)).toBe('۹۹۹٬۹۹۹')
    expect(formatNumber(1_234_567)).toBe('۱٬۲۳۴٬۵۶۷')
  })

  it('renders numbers under a thousand as Persian digits', () => {
    expect(formatNumber(0)).toBe('۰')
    expect(formatNumber(12)).toBe('۱۲')
    expect(formatNumber(999)).toBe('۹۹۹')
  })

  it('can leave thousands ungrouped for numbers that are not amounts', () => {
    expect(formatNumber(1000, { group: false })).toBe('۱۰۰۰')
    expect(formatNumber(1405, { group: false })).toBe('۱۴۰۵')
    expect(formatNumber(12, { group: false })).toBe('۱۲')
  })
})
