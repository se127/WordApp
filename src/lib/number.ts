const numberFormat = new Intl.NumberFormat('fa-IR')

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}
