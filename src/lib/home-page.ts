import type { DocumentListOrder } from '@/types/global'

let homePage = 1
let homeOrder: DocumentListOrder = 'newest'

export function readHomePage(): number {
  return homePage
}

export function saveHomePage(page: number): void {
  homePage = page
}

export function readHomeOrder(): DocumentListOrder {
  return homeOrder
}

export function saveHomeOrder(order: DocumentListOrder): void {
  homeOrder = order
}
