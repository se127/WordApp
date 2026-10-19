import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type DocumentRecord = {
  id: number
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

export type DocumentChanges = {
  title?: string
  body?: string
}

export type DocumentListCursor = {
  createdAt: number
  id: number
}

export type DocumentListOptions = {
  cursor: DocumentListCursor | null
  limit: number
}

export type DocumentListPage = {
  documents: DocumentRecord[]
  nextCursor: DocumentListCursor | null
}

type DocumentRow = {
  id: number
  title: string
  body: string
  created_at: number
  updated_at: number
}

export type WordAppDatabase = {
  createDocument: () => Promise<DocumentRecord>
  getDocument: (id: number) => Promise<DocumentRecord | undefined>
  countDocuments: () => Promise<number>
  listDocuments: (options: DocumentListOptions) => Promise<DocumentListPage>
  deleteDocument: (id: number) => Promise<void>
  deleteDocuments: (ids: readonly number[]) => Promise<void>
  saveDocument: (
    id: number,
    changes: DocumentChanges,
  ) => Promise<DocumentRecord | undefined>
  close: () => void
}

export const databaseOperationNames = [
  'createDocument',
  'getDocument',
  'countDocuments',
  'listDocuments',
  'listMoreDocuments',
  'deleteDocument',
  'deleteDocuments',
  'saveDocument',
] as const

export type DatabaseOperationName = (typeof databaseOperationNames)[number]

export const untitledDocumentTitle = 'بدون عنوان'

const migrations: string[] = [
  `
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX documents_created_at_idx ON documents (created_at DESC);

CREATE TRIGGER documents_touch_updated_at
AFTER UPDATE ON documents
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE documents
  SET updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
  WHERE id = NEW.id;
END;
`,
  `
DROP INDEX documents_created_at_idx;

CREATE INDEX documents_created_at_id_idx ON documents (created_at DESC, id DESC);
`,
]

function migrate(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as {
    user_version: number
  }

  for (
    let version = row.user_version;
    version < migrations.length;
    version += 1
  ) {
    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(migrations[version])
      database.exec(`PRAGMA user_version = ${version + 1}`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}

function openDatabaseHandle(databasePath: string): DatabaseSync {
  mkdirSync(path.dirname(databasePath), { recursive: true })

  const database = new DatabaseSync(databasePath)

  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA synchronous = NORMAL')
  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA busy_timeout = 5000')

  migrate(database)

  return database
}

export type OpenDatabaseOptions = {
  operationDelayMs?: number
  failingOperations?: readonly DatabaseOperationName[]
}

export function openDatabase(
  databasePath: string,
  { operationDelayMs = 0, failingOperations = [] }: OpenDatabaseOptions = {},
): WordAppDatabase {
  const database = openDatabaseHandle(databasePath)

  const waitBeforeQuery = async (): Promise<void> => {
    if (operationDelayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, operationDelayMs)
      })
    }
  }

  const failing = new Set(failingOperations)
  const failInjectedOperation = (operation: DatabaseOperationName): void => {
    if (failing.has(operation)) {
      throw new Error(
        `The ${operation} operation failed (injected by --with-db-failure)`,
      )
    }
  }

  const insertDocument = database.prepare(
    `INSERT INTO documents (title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
  )
  const selectDocument = database.prepare(
    `SELECT id, title, body, created_at, updated_at
     FROM documents
     WHERE id = ?`,
  )
  const selectDocumentCount = database.prepare(
    'SELECT COUNT(*) AS count FROM documents',
  )
  const selectFirstDocumentPage = database.prepare(
    `SELECT id, title, body, created_at, updated_at
     FROM documents
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  )
  const selectDocumentPageAfter = database.prepare(
    `SELECT id, title, body, created_at, updated_at
     FROM documents
     WHERE (created_at, id) < (?, ?)
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
  )

  const deleteDocumentById = database.prepare(
    'DELETE FROM documents WHERE id = ?',
  )
  const deleteDocumentsByIds = database.prepare(
    `DELETE FROM documents WHERE id IN (SELECT value FROM json_each(?))`,
  )
  const updateDocument = database.prepare(
    `UPDATE documents SET title = COALESCE(?, title), body = COALESCE(?, body)
     WHERE id = ?`,
  )

  const toRecord = (row: DocumentRow): DocumentRecord => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

  return {
    async createDocument() {
      await waitBeforeQuery()
      failInjectedOperation('createDocument')

      const now = Date.now()
      const { lastInsertRowid } = insertDocument.run(
        untitledDocumentTitle,
        '',
        now,
        now,
      )

      return {
        id: Number(lastInsertRowid),
        title: untitledDocumentTitle,
        body: '',
        createdAt: now,
        updatedAt: now,
      }
    },

    async getDocument(id) {
      await waitBeforeQuery()
      failInjectedOperation('getDocument')

      const row = selectDocument.get(id) as DocumentRow | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    async countDocuments() {
      await waitBeforeQuery()
      failInjectedOperation('countDocuments')

      const row = selectDocumentCount.get() as { count: number }
      return row.count
    },

    async listDocuments({ cursor, limit }) {
      await waitBeforeQuery()
      failInjectedOperation(
        cursor === null ? 'listDocuments' : 'listMoreDocuments',
      )

      const rows = (
        cursor === null
          ? selectFirstDocumentPage.all(limit + 1)
          : selectDocumentPageAfter.all(cursor.createdAt, cursor.id, limit + 1)
      ) as DocumentRow[]

      const pageRows = rows.slice(0, limit)
      const lastRow = pageRows.at(-1)

      return {
        documents: pageRows.map(toRecord),
        nextCursor:
          rows.length > limit && lastRow !== undefined
            ? { createdAt: lastRow.created_at, id: lastRow.id }
            : null,
      }
    },

    async deleteDocument(id) {
      await waitBeforeQuery()
      failInjectedOperation('deleteDocument')

      deleteDocumentById.run(id)
    },

    async deleteDocuments(ids) {
      await waitBeforeQuery()
      failInjectedOperation('deleteDocuments')

      if (ids.length === 0) {
        return
      }

      deleteDocumentsByIds.run(JSON.stringify(ids))
    },

    async saveDocument(id, changes) {
      await waitBeforeQuery()
      failInjectedOperation('saveDocument')

      if (changes.title !== undefined || changes.body !== undefined) {
        updateDocument.run(changes.title ?? null, changes.body ?? null, id)
      }

      const row = selectDocument.get(id) as DocumentRow | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    close() {
      database.exec('PRAGMA optimize')
      database.close()
    },
  }
}

export type SeedEntry = { table: string; count: number }

export const emptySeed: SeedEntry[] = [{ table: 'documents', count: 0 }]

export function parseSeedArgument(value: string): SeedEntry[] {
  if (value === '') {
    return []
  }

  return value.split('-').map((entry) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*),(\d+)$/.exec(entry)
    if (!match) {
      throw new Error(
        `Invalid --seed entry "${entry}": every entry must look like <table>,<count>`,
      )
    }

    const count = Number(match[2])
    if (!Number.isSafeInteger(count)) {
      throw new Error(`Invalid --seed entry "${entry}": the count is too large`)
    }

    return { table: match[1], count }
  })
}

const maximumTimerDelayMs = 2 ** 31 - 1

export function parseDbDelayArgument(value: string): number {
  if (value === '') {
    return 0
  }

  const match = /^(\d+)ms$/.exec(value)
  if (!match) {
    throw new Error(
      `Invalid --db-delay "${value}": the value must look like <milliseconds>ms, e.g. 2000ms`,
    )
  }

  const delayMs = Number(match[1])
  if (!Number.isSafeInteger(delayMs) || delayMs > maximumTimerDelayMs) {
    throw new Error(`Invalid --db-delay "${value}": the delay is too long`)
  }

  return delayMs
}

export function parseDbFailureArgument(value: string): DatabaseOperationName[] {
  if (value === '') {
    return []
  }

  return value.split(',').map((name) => {
    if (!(databaseOperationNames as readonly string[]).includes(name)) {
      throw new Error(
        `Invalid --with-db-failure operation "${name}": valid operations are ${databaseOperationNames.join(', ')}`,
      )
    }

    return name as DatabaseOperationName
  })
}

function tableNames(database: DatabaseSync): string[] {
  const rows = database
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as Array<{ name: string }>

  return rows.map((row) => row.name)
}

const quoteIdentifier = (name: string): string =>
  `"${name.replaceAll('"', '""')}"`

const documentSeedIntervalMs = 60_000

const seededDocumentTitle = (position: number): string => `سند ${position}`

function insertSeedRows(
  database: DatabaseSync,
  seed: readonly SeedEntry[],
): void {
  const tables = new Set(tableNames(database))

  for (const { table, count } of seed) {
    if (!tables.has(table)) {
      throw new Error(`Cannot seed table "${table}": no such table`)
    }

    switch (table) {
      case 'documents': {
        const insert = database.prepare(
          `INSERT INTO documents (title, body, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
        )

        const seededAt = Date.now()
        for (let index = 0; index < count; index += 1) {
          const timestamp = seededAt - index * documentSeedIntervalMs
          insert.run(seededDocumentTitle(index + 1), '', timestamp, timestamp)
        }

        break
      }

      default: {
        throw new Error(`Cannot seed table "${table}": no seeding rule for it`)
      }
    }
  }
}

export function resetDatabase(
  databasePath: string,
  seed: readonly SeedEntry[],
): void {
  const database = openDatabaseHandle(databasePath)

  try {
    database.exec('BEGIN IMMEDIATE')
    try {
      for (const name of tableNames(database)) {
        database.exec(`DELETE FROM ${quoteIdentifier(name)}`)
      }

      insertSeedRows(database, seed)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  } finally {
    database.close()
  }
}
