export const fontSizes = [16, 18, 20, 24] as const

export type FontSize = (typeof fontSizes)[number]

const rootFontSize = 16

const keywordFontSizes: Record<string, number> = {
  'xx-small': 9,
  'x-small': 10,
  small: 13,
  medium: 16,
  large: 18,
  'x-large': 24,
  'xx-large': 32,
  'xxx-large': 48,
}

const legacyFontSizes: Record<string, number> = {
  '1': 10,
  '2': 13,
  '3': 16,
  '4': 18,
  '5': 24,
  '6': 32,
  '7': 48,
}

const fontSizePattern =
  /^([+-]?(?:\d+\.?\d*|\.\d+))(px|pt|pc|in|cm|mm|q|em|rem|%)$/

const ignoredTags = new Set([
  'HEAD',
  'LINK',
  'META',
  'NOSCRIPT',
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'TITLE',
])

export function snapFontSize(size: number): FontSize {
  if (!Number.isFinite(size)) {
    return fontSizes[0]
  }

  let nearest: FontSize = fontSizes[0]

  for (const candidate of fontSizes) {
    if (Math.abs(candidate - size) <= Math.abs(nearest - size)) {
      nearest = candidate
    }
  }

  return nearest
}

export function parseFontSize(
  value: string | null | undefined,
  parentSize = rootFontSize,
): number | null {
  if (!value) {
    return null
  }

  const normalized = value.trim().toLowerCase()
  const keywordSize = keywordFontSizes[normalized]

  if (keywordSize !== undefined) {
    return keywordSize
  }

  if (normalized === 'smaller') {
    return parentSize / 1.2
  }

  if (normalized === 'larger') {
    return parentSize * 1.2
  }

  const match = fontSizePattern.exec(normalized)

  if (match === null) {
    return null
  }

  const amount = Number(match[1])

  if (!Number.isFinite(amount)) {
    return null
  }

  switch (match[2]) {
    case 'px':
      return amount
    case 'pt':
      return (amount * 4) / 3
    case 'pc':
      return amount * 16
    case 'in':
      return amount * 96
    case 'cm':
      return (amount * 96) / 2.54
    case 'mm':
      return (amount * 96) / 25.4
    case 'q':
      return (amount * 96) / 101.6
    case 'em':
      return amount * parentSize
    case 'rem':
      return amount * rootFontSize
    case '%':
      return (amount / 100) * parentSize
    default:
      return null
  }
}

function elementFontSize(
  element: HTMLElement,
  parentSize: number,
): number | null {
  const styledSize = parseFontSize(element.style.fontSize, parentSize)

  if (styledSize !== null) {
    return styledSize
  }

  if (element.tagName !== 'FONT') {
    return null
  }

  const legacySize = element.getAttribute('size')

  if (legacySize === null) {
    return null
  }

  return legacyFontSizes[legacySize.trim()] ?? null
}

function clearElementFontSize(element: HTMLElement): void {
  element.style.removeProperty('font-size')

  if (element.getAttribute('style')?.trim() === '') {
    element.removeAttribute('style')
  }

  if (element.tagName === 'FONT') {
    element.removeAttribute('size')
  }
}

function normalizeElement(
  element: HTMLElement,
  parentSize: number,
  parentHasFontSize: boolean,
): void {
  if (ignoredTags.has(element.tagName)) {
    return
  }

  const ownSize = elementFontSize(element, parentSize)
  const size = ownSize ?? parentSize
  const hasFontSize = parentHasFontSize || ownSize !== null

  if (ownSize !== null) {
    clearElementFontSize(element)
  }

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''

      if (!hasFontSize || text.trim() === '') {
        continue
      }

      const span = element.ownerDocument.createElement('span')
      span.style.fontSize = `${snapFontSize(size)}px`
      child.replaceWith(span)
      span.append(child)
      continue
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      normalizeElement(child as HTMLElement, size, hasFontSize)
    }
  }

  if (
    (element.tagName === 'SPAN' || element.tagName === 'FONT') &&
    element.attributes.length === 0
  ) {
    element.replaceWith(...Array.from(element.childNodes))
  }
}

export function normalizePastedFontSizes(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const bodyOwnSize = elementFontSize(parsed.body, rootFontSize)
  const bodySize = bodyOwnSize ?? rootFontSize
  const bodyHasFontSize = bodyOwnSize !== null

  if (bodyHasFontSize) {
    clearElementFontSize(parsed.body)
  }

  for (const child of Array.from(parsed.body.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''

      if (!bodyHasFontSize || text.trim() === '') {
        continue
      }

      const span = parsed.createElement('span')
      span.style.fontSize = `${snapFontSize(bodySize)}px`
      child.replaceWith(span)
      span.append(child)
      continue
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      normalizeElement(child as HTMLElement, bodySize, bodyHasFontSize)
    }
  }

  return parsed.body.innerHTML
}
