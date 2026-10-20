import { formatNumber } from '@/lib/number'

const minuteMs = 60_000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs
const monthMs = 30 * dayMs
const yearMs = 365 * dayMs

const zeroWidthCharacters = /[\u200b\u200c\u200d]/g

function withoutZeroWidthCharacters(text: string): string {
  return text.replace(zeroWidthCharacters, ' ')
}

export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const elapsed = now - timestamp

  if (elapsed < minuteMs) {
    return 'همین الان'
  }

  if (elapsed < hourMs) {
    return `${formatNumber(Math.floor(elapsed / minuteMs), { group: false })} دقیقه ی پیش`
  }

  if (elapsed < dayMs) {
    return `${formatNumber(Math.floor(elapsed / hourMs), { group: false })} ساعت پیش`
  }

  if (elapsed < monthMs) {
    return `${formatNumber(Math.floor(elapsed / dayMs), { group: false })} روز پیش`
  }

  if (elapsed < yearMs) {
    return `${formatNumber(Math.floor(elapsed / monthMs), { group: false })} ماه پیش`
  }

  return `${formatNumber(Math.floor(elapsed / yearMs), { group: false })} سال پیش`
}

const persianDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const clockTime = new Intl.DateTimeFormat('fa-IR-u-nu-latn', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partValue(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? ''
}

export function formatAbsoluteDate(timestamp: number): string {
  const date = new Date(timestamp)
  const dateParts = persianDate.formatToParts(date)
  const timeParts = clockTime.formatToParts(date)

  const weekday = partValue(dateParts, 'weekday')
  const day = partValue(dateParts, 'day')
  const month = partValue(dateParts, 'month')
  const year = partValue(dateParts, 'year')
  const hour = partValue(timeParts, 'hour')
  const minute = partValue(timeParts, 'minute')

  return withoutZeroWidthCharacters(
    `${weekday} ${day} ${month} ماه ${year} ، ${hour}:${minute}`,
  )
}
