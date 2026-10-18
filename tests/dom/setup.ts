import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

const scrollAreaViewportHeight = 600
const tableRowHeight = 37

const nativeClientHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientHeight',
)?.get
const nativeGetBoundingClientRect = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'getBoundingClientRect',
)?.value as ((this: Element) => DOMRect) | undefined

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get(this: HTMLElement) {
    const measured = nativeClientHeight?.call(this) ?? 0
    if (
      measured === 0 &&
      this.getAttribute('data-slot') === 'scroll-area-viewport'
    ) {
      return scrollAreaViewportHeight
    }
    return measured
  },
})

Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  configurable: true,
  writable: true,
  value: function (this: Element) {
    if (this.hasAttribute('data-index')) {
      return new DOMRect(0, 0, 0, tableRowHeight)
    }
    return nativeGetBoundingClientRect
      ? nativeGetBoundingClientRect.call(this)
      : new DOMRect()
  },
})

afterEach(() => {
  cleanup()
})
