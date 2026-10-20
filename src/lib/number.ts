const groupedNumberFormat = new Intl.NumberFormat('fa-IR')
const plainNumberFormat = new Intl.NumberFormat('fa-IR', { useGrouping: false })

export function formatNumber(
  value: number,
  { group = true }: { group?: boolean } = {},
): string {
  return (group ? groupedNumberFormat : plainNumberFormat).format(value)
}
