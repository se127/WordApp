import { useDebouncedValue } from '@/lib/use-debounced-value'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('waits for the full delay before reporting the next value', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'گ' } },
    )

    expect(result.current).toBe('گ')

    rerender({ value: 'گزارش' })
    expect(result.current).toBe('گ')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('گ')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('گزارش')
  })

  it('restarts the timer on every change and ignores the earlier value', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      { initialProps: { value: '' } },
    )

    rerender({ value: 'گ' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ value: 'گزارش' })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('گزارش')
  })
})
