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

export type WordAppDatabase = {
  createDocument: () => DocumentRecord
  getDocument: (id: number) => DocumentRecord | undefined
  countDocuments: () => number
  close: () => void
}

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

// Opens (creating and migrating when needed) the SQLite database file at
// `databasePath`. The caller owns the returned handle and must `close()` it
// before the app quits.
export function openDatabase(databasePath: string): WordAppDatabase {
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

  const toRecord = (row: DocumentRow): DocumentRecord => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

  return {
    createDocument() {
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

    getDocument(id) {
      const row = selectDocument.get(id) as DocumentRow | undefined
      return row === undefined ? undefined : toRecord(row)
    },

    countDocuments() {
      const row = selectDocumentCount.get() as { count: number }
      return row.count
    },

    close() {
      // SQLite recommends this before a long-lived connection ends: it
      // refreshes the planner statistics gathered during the session.
      database.exec('PRAGMA optimize')
      database.close()
    },
  }
}
