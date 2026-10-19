import type { VirtualItem } from '@tanstack/react-virtual'

let homeScrollOffset: number | null = null
let homeMeasurements: Array<VirtualItem> = []

export function readHomeScrollOffset(): number | null {
  return homeScrollOffset
}

export function saveHomeScrollOffset(offset: number): void {
  homeScrollOffset = offset
}

export function readHomeMeasurements(): Array<VirtualItem> {
  return homeMeasurements
}

export function saveHomeMeasurements(measurements: Array<VirtualItem>): void {
  homeMeasurements = measurements
}

export function resetHomeScrollOffset(): void {
  homeScrollOffset = 0
  homeMeasurements = []
}

export function clearHomeScrollOffset(): void {
  homeScrollOffset = null
  homeMeasurements = []
}
