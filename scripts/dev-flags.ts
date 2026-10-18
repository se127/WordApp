import type { DatabaseOperationName, SeedEntry } from '../electron/database.ts'

export type DevFlags = {
  seedEntries: readonly SeedEntry[]
  dbDelayMs: number
  failingOperations?: readonly DatabaseOperationName[]
}

export function formatOperationLabel(operation: DatabaseOperationName): string {
  return operation
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\s]+/)
    .filter((word) => word.length > 0)
    .join(' ')
    .toLowerCase()
}

const flagBlock = (
  title: string,
  details: readonly string[] | undefined,
): string => {
  if (details === undefined) {
    return `❌ ${title}`
  }

  return [
    `✅ ${title}:`,
    ...(details.length > 0 ? details : ['  - none']),
  ].join('\n')
}

export function formatDevFlags({
  seedEntries,
  dbDelayMs,
  failingOperations,
}: DevFlags): string {
  const blocks = [
    flagBlock(
      'seed',
      seedEntries.map((entry) => `  - ${entry.table}: ${entry.count}`),
    ),
    `✅ db delay: ${dbDelayMs}ms`,
    flagBlock(
      'with db failure',
      failingOperations?.map(
        (operation) => `  - ${formatOperationLabel(operation)}`,
      ),
    ),
  ]

  return blocks.join('\n\n')
}
