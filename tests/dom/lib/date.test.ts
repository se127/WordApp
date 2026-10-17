import { formatAbsoluteDate, formatRelativeTime } from '@/lib/date'
import { describe, expect, it } from 'vitest'

const minuteMs = 60_000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs

describe('formatRelativeTime', () => {
  it('shows همین الان under a minute, including for a future timestamp', () => {
    const now = 10_000_000

    expect(formatRelativeTime(now, now)).toBe('همین الان')
    expect(formatRelativeTime(now - 59_000, now)).toBe('همین الان')
    expect(formatRelativeTime(now + 5_000, now)).toBe('همین الان')
  })

  it('counts whole minutes and hours', () => {
    const now = 10_000_000

    expect(formatRelativeTime(now - minuteMs, now)).toBe('1 دقیقه ی پیش')
    expect(formatRelativeTime(now - (5 * minuteMs + 59_000), now)).toBe(
      '5 دقیقه ی پیش',
    )
    expect(formatRelativeTime(now - hourMs, now)).toBe('1 ساعت پیش')
    expect(formatRelativeTime(now - 23 * hourMs, now)).toBe('23 ساعت پیش')
  })

  it('counts days, months, and years', () => {
    const now = 10_000_000

    expect(formatRelativeTime(now - dayMs, now)).toBe('1 روز پیش')
    expect(formatRelativeTime(now - 29 * dayMs, now)).toBe('29 روز پیش')
    expect(formatRelativeTime(now - 30 * dayMs, now)).toBe('1 ماه پیش')
    expect(formatRelativeTime(now - 364 * dayMs, now)).toBe('12 ماه پیش')
    expect(formatRelativeTime(now - 365 * dayMs, now)).toBe('1 سال پیش')
    expect(formatRelativeTime(now - 800 * dayMs, now)).toBe('2 سال پیش')
  })
})

describe('formatAbsoluteDate', () => {
  it('renders the Persian-calendar date and clock with a spaced ،', () => {
    expect(formatAbsoluteDate(new Date(2026, 6, 8, 14, 45).getTime())).toBe(
      'چهارشنبه 17 تیر ماه 1405 ، 14:45',
    )
  })

  it('pads the clock and keeps zero-width characters out of the weekdays', () => {
    expect(formatAbsoluteDate(new Date(2026, 6, 6, 9, 5).getTime())).toBe(
      'دوشنبه 15 تیر ماه 1405 ، 09:05',
    )
    expect(formatAbsoluteDate(new Date(2026, 6, 7, 13, 0).getTime())).toBe(
      'سه شنبه 16 تیر ماه 1405 ، 13:00',
    )
  })
})
