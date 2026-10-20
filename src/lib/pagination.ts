export type PaginationEntry = number | 'start-ellipsis' | 'end-ellipsis'

export function paginationEntries(
  page: number,
  totalPages: number,
): PaginationEntry[] {
  const start = Math.max(2, page - 3)
  const end = Math.min(totalPages - 1, page + 3)
  const entries: PaginationEntry[] = [1]

  if (start > 2) {
    entries.push('start-ellipsis')
  }

  for (let entry = start; entry <= end; entry += 1) {
    entries.push(entry)
  }

  if (end < totalPages - 1) {
    entries.push('end-ellipsis')
  }

  if (totalPages > 1) {
    entries.push(totalPages)
  }

  return entries
}
