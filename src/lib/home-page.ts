import type { DocumentListOrder } from '@/types/global'

export type HomeScrollPosition = {
  page: number
  scrollTop: number
}

let homePage = 1
let homeOrder: DocumentListOrder = 'newest'
let homeScrollPosition: HomeScrollPosition | null = null

export function readHomePage(): number {
  return homePage
}

export function saveHomePage(page: number): void {
  homePage = page
}

export function readHomeScrollPosition(): HomeScrollPosition | null {
  return homeScrollPosition
}

export function saveHomeScrollPosition(position: HomeScrollPosition): void {
  homeScrollPosition = position
}

export function clearHomeScrollPosition(): void {
  homeScrollPosition = null
}

export function readHomeOrder(): DocumentListOrder {
  return homeOrder
}

export function saveHomeOrder(order: DocumentListOrder): void {
  homeOrder = order
}
