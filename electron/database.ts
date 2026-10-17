import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// A document row as the rest of the app sees it. Mirrored in
// src/types/global.d.ts, which is what the renderer is typed against.
export type DocumentRecord = {
  id: number
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

// The same row as the database stores it: snake_case columns, and timestamps
// as Unix epoch milliseconds (integer, time-zone free, and cheap to sort).
type DocumentRow = {
  id: number
  title: string
  body: string
  created_at: number
  updated_at: number
}

// The store's queries are asynchronous so the dev-only operation delay (see
// openDatabase's `operationDelayMs` and the dev script's --db-delay) can sit
// in front of each one; `close` stays synchronous.
export type WordAppDatabase = {
  createDocument: () => Promise<DocumentRecord>
  getDocument: (id: number) => Promise<DocumentRecord | undefined>
  countDocuments: () => Promise<number>
  deleteDocument: (id: number) => Promise<void>
  close: () => void
}

// The store operations the dev script's --with-db-failure knob can make fail,
// named exactly as their methods: the prompt lists them, its answer reaches
// the main process as DEV_DB_FAILURE, and the names selected there fail
// instead of running (see openDatabase's `failingOperations`). `close` is not
// on the list: it runs no query and must always work.
export const databaseOperationNames = [
  'createDocument',
  'getDocument',
  'countDocuments',
  'deleteDocument',
] as const

export type DatabaseOperationName = (typeof databaseOperationNames)[number]

// Title of a freshly created document until the user renames it.
export const untitledDocumentTitle = 'بدون عنوان'

// Schema history, one entry per `PRAGMA user_version`. Entries are applied in
// order when the database is opened; an entry that has shipped must never be
// edited, only followed by a new one.
const migrations: string[] = [
  `
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

-- The home page lists documents newest first; this index serves that sort
-- (and later keyset pagination on created_at) without sorting a full scan.
CREATE INDEX documents_created_at_idx ON documents (created_at DESC);

-- Keeps updated_at honest for every update that does not set it itself.
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
]

// Applies every migration newer than the file's `user_version`, one
// transaction each, so an interrupted upgrade leaves the schema untouched.
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
      // Interpolated rather than bound: PRAGMA values cannot be parameters.
      // This is the loop counter, never user input.
      database.exec(`PRAGMA user_version = ${version + 1}`)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}

// Opens (creating and migrating when needed) a raw connection to the database
// file. Shared by the app store below and the dev reset.
function openDatabaseHandle(databasePath: string): DatabaseSync {
  // The packaged app's user-data folder exists already, but the dev folder in
  // the project does not; SQLite creates the file, not its directory.
  mkdirSync(path.dirname(databasePath), { recursive: true })

  const database = new DatabaseSync(databasePath)

  // Durable-enough defaults for a single-process desktop app: WAL keeps
  // readers out of the writer's way, NORMAL is the synchronous level SQLite
  // recommends for WAL, foreign keys are enforced, and the busy timeout waits
  // out transient locks instead of failing the statement.
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA synchronous = NORMAL')
  database.exec('PRAGMA foreign_keys = ON')
  database.exec('PRAGMA busy_timeout = 5000')

  migrate(database)

  return database
}

// Options for openDatabase.
export type OpenDatabaseOptions = {
  // Dev-only knob (the dev script's --db-delay): every operation waits this
  // many milliseconds before running its query, so the renderer's loading
  // states can be watched by hand. Zero — the default — runs queries
  // immediately.
  operationDelayMs?: number
  // Dev-only knob (the dev script's --with-db-failure): the named operations
  // fail instead of running their query, so the renderer's error handling
  // can be exercised by hand. Each failure happens after the operation delay
  // — like a slow query that then fails. Empty — the default — fails
  // nothing.
  failingOperations?: readonly DatabaseOperationName[]
}

// Opens (creating and migrating when needed) the SQLite database file at
// `databasePath`. The caller owns the returned handle and must `close()` it
// before the app quits.
export function openDatabase(
  databasePath: string,
  { operationDelayMs = 0, failingOperations = [] }: OpenDatabaseOptions = {},
): WordAppDatabase {
  const database = openDatabaseHandle(databasePath)

  // The dev delay applies per operation, before its query runs; zero skips
  // the wait — and its timer — entirely. Every operation added to the store
  // below must start by awaiting this, so the dev script's --db-delay keeps
  // covering every query.
  const waitBeforeQuery = async (): Promise<void> => {
    if (operationDelayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, operationDelayMs)
      })
    }
  }

  // The --with-db-failure injection: a selected operation throws after its
  // delay instead of running its query. The message names the flag, so a
  // failure seen in the renderer is easy to trace back to this dev-only
  // path.
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
  const deleteDocumentById = database.prepare(
    'DELETE FROM documents WHERE id = ?',
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

    async deleteDocument(id) {
      await waitBeforeQuery()
      failInjectedOperation('deleteDocument')

      // Deleting an id that does not exist is not an error: the statement
      // simply removes no rows.
      deleteDocumentById.run(id)
    },

    close() {
      // SQLite recommends this before a long-lived connection ends: it
      // refreshes the planner statistics gathered during the session.
      database.exec('PRAGMA optimize')
      database.close()
    },
  }
}

// One `<table>,<count>` entry of the dev script's --seed argument.
export type SeedEntry = { table: string; count: number }

// Parses the dev script's --seed value: `<table>,<count>` entries joined with
// `-`, e.g. `documents,50-users,50`. An empty value seeds nothing. Anything
// that does not match the shape throws, so a typo fails the dev run instead
// of silently seeding the wrong rows.
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

// The largest delay setTimeout accepts: anything longer would overflow its
// 32-bit millisecond counter and fire almost immediately instead.
const maximumTimerDelayMs = 2 ** 31 - 1

// Parses the dev script's --db-delay value: a millisecond duration such as
// `2000ms`. An empty value means no delay at all. Anything that does not match
// the shape throws, so a typo fails the dev run instead of silently delaying
// nothing.
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

// Parses the DEV_DB_FAILURE value the dev script sends: the operations its
// --with-db-failure prompt selected, as a comma-separated list, e.g.
// `createDocument,countDocuments`. An empty value — no flag, or nothing
// selected — fails nothing. Anything else throws, so a typo fails the dev
// run instead of silently failing the wrong operation.
export function parseDbFailureArgument(value: string): DatabaseOperationName[] {
  if (value === '') {
    return []
  }

  return value.split(',').map((name) => {
    // The names come from electron/database.ts's own list, mirrored from the
    // store's methods; an unknown name means the two drifted apart.
    if (!(databaseOperationNames as readonly string[]).includes(name)) {
      throw new Error(
        `Invalid --with-db-failure operation "${name}": valid operations are ${databaseOperationNames.join(', ')}`,
      )
    }

    return name as DatabaseOperationName
  })
}

// Every table's rows belong to the dev reset, so the schema is enumerated
// instead of naming tables: future tables are emptied without a code change.
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

// What a seed row contains is up to each table; documents get empty untitled
// rows, the same ones the add-document button creates.
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

        for (let index = 0; index < count; index += 1) {
          const now = Date.now()
          insert.run(untitledDocumentTitle, '', now, now)
        }

        break
      }

      default: {
        throw new Error(`Cannot seed table "${table}": no seeding rule for it`)
      }
    }
  }
}

// The dev script's reset (see electron/main.ts): removes every row from every
// table and, when the --seed argument named tables, inserts their seed rows.
// Dev runs call this before the app store opens, so every run starts from an
// empty database plus whatever was seeded. One transaction covers the wipe
// and the inserts: a failed seeding rolls the wipe back as well.
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
