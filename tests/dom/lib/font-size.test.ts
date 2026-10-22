import {
  fontSizes,
  normalizePastedFontSizes,
  parseFontSize,
  snapFontSize,
} from '@/lib/font-size'
import { describe, expect, it } from 'vitest'

function normalizedContainer(html: string): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = normalizePastedFontSizes(html)
  return container
}

describe('font size normalization', () => {
  it('offers only 16, 18, 20, and 24 pixels and snaps to the nearest one', () => {
    expect(fontSizes).toEqual([16, 18, 20, 24])
    expect(snapFontSize(12)).toBe(16)
    expect(snapFontSize(16)).toBe(16)
    expect(snapFontSize(17)).toBe(18)
    expect(snapFontSize(18)).toBe(18)
    expect(snapFontSize(19)).toBe(20)
    expect(snapFontSize(20)).toBe(20)
    expect(snapFontSize(21)).toBe(20)
    expect(snapFontSize(22)).toBe(24)
    expect(snapFontSize(24)).toBe(24)
    expect(snapFontSize(40)).toBe(24)
    expect(snapFontSize(Number.NaN)).toBe(16)
  })

  it('parses the units and keywords that pasted HTML carries', () => {
    expect(parseFontSize('16px')).toBe(16)
    expect(parseFontSize('13.5pt')).toBe(18)
    expect(parseFontSize('1.5em', 16)).toBe(24)
    expect(parseFontSize('150%', 16)).toBe(24)
    expect(parseFontSize('large')).toBe(18)
    expect(parseFontSize('bogus')).toBeNull()
  })

  it('normalizes explicit sizes on pasted spans', () => {
    const container = normalizedContainer(
      '<p><span style="font-size: 12px">کوچک</span><span style="font-size: 30px">بزرگ</span></p>',
    )
    const spans = container.querySelectorAll<HTMLElement>('p span')

    expect(spans[0]?.style.fontSize).toBe('16px')
    expect(spans[1]?.style.fontSize).toBe('24px')
    expect(container.innerHTML).not.toContain('12px')
    expect(container.innerHTML).not.toContain('30px')
  })

  it('normalizes sizes between the allowed values', () => {
    const container = normalizedContainer(
      '<p><span style="font-size: 17px">الف</span><span style="font-size: 19px">ب</span><span style="font-size: 22px">پ</span></p>',
    )
    const spans = container.querySelectorAll<HTMLElement>('p span')

    expect(spans[0]?.style.fontSize).toBe('18px')
    expect(spans[1]?.style.fontSize).toBe('20px')
    expect(spans[2]?.style.fontSize).toBe('24px')
  })

  it('keeps an inherited container size when its block is pasted', () => {
    const container = normalizedContainer(
      '<div style="font-size: 13px"><p>متن</p></div>',
    )

    expect(container.querySelector('div')).not.toHaveAttribute('style')
    expect(
      container.querySelector<HTMLElement>('p > span')?.style.fontSize,
    ).toBe('16px')
  })

  it('keeps relative sizes relative to their parent element', () => {
    const container = normalizedContainer(
      '<div style="font-size: 20px"><span style="font-size: 150%">متن</span></div>',
    )

    expect(container.querySelector('div')).not.toHaveAttribute('style')
    expect(
      container.querySelector<HTMLElement>('div > span')?.style.fontSize,
    ).toBe('24px')
  })

  it('normalizes legacy font tags', () => {
    const container = normalizedContainer('<p><font size="1">متن</font></p>')

    expect(container.querySelector('font')).toBeNull()
    expect(container.querySelector<HTMLElement>('p span')?.style.fontSize).toBe(
      '16px',
    )
  })

  it('leaves text without an explicit size unwrapped', () => {
    const container = normalizedContainer('<p>متن</p>')

    expect(container.querySelector('span')).toBeNull()
  })
})
