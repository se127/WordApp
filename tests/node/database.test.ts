import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  openDatabase,
  parseSeedArgument,
  resetDatabase,
  untitledDocumentTitle,
} from '../../electron/database.ts'
import type { WordAppDatabase } from '../../electron/database.ts'

let temporaryDirectory: string | undefined
let database: WordAppDatabase | undefined

// Bun releases SQLite's Windows file handles only once the JavaScript
// database objects are collected; this suite runs on Bun (like all Vitest
// here), so force a GC before deleting a test database. On Node the call is a
// no-op — close() releases the files immediately.
function collectDatabaseObjects(): void {
  ;(globalThis as { Bun?: { gc?: (force: boolean) => void } }).Bun?.gc?.(true)
}

// A fresh temp directory with a database path inside it, tracked for
// teardown. For tests that drive the file themselves (through resetDatabase
// or a raw connection) instead of the open store.
function temporaryDatabasePath(): string {
  temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), 'wordapp-database-test-'),
  )
  return path.join(temporaryDirectory, 'db.sqlite')
}

// Opens a fresh database in a fresh temp directory and tracks both for
// teardown, so every test starts from an empty, fully migrated file.
function openTestDatabase(): {
  database: WordAppDatabase
  databasePath: string
} {
  const databasePath = temporaryDatabasePath()
  const instance = openDatabase(databasePath)
  database = instance

  return { database: instance, databasePath }
}

afterEach(() => {
  database?.close()
  database = undefined
  collectDatabaseObjects()

  if (temporaryDirectory) {
    rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    })
    temporaryDirectory = undefined
  }
})

describe('openDatabase', () => {
  it('migrates a fresh file to the expected schema', () => {
    const { databasePath } = openTestDatabase()
    const raw = new DatabaseSync(databasePath)

    try {
      expect(raw.prepare('PRAGMA user_version').get()).toEqual({
        user_version: 1,
      })
      expect(raw.prepare('PRAGMA journal_mode').get()).toEqual({
        journal_mode: 'wal',
      })

      const table = raw
        .prepare(
          "SELECT type, strict FROM pragma_table_list WHERE name = 'documents'",
        )
        .get()
      expect(table).toEqual({ type: 'table', strict: 1 })

      const columns = raw
        .prepare(
          `SELECT name, type, "notnull" AS "notNull", pk
           FROM pragma_table_info('documents')
           ORDER BY cid`,
        )
        .all()
      expect(columns).toEqual([
        { name: 'id', type: 'INTEGER', notNull: 0, pk: 1 },
        { name: 'title', type: 'TEXT', notNull: 1, pk: 0 },
        { name: 'body', type: 'TEXT', notNull: 1, pk: 0 },
        { name: 'created_at', type: 'INTEGER', notNull: 1, pk: 0 },
        { name: 'updated_at', type: 'INTEGER', notNull: 1, pk: 0 },
      ])

      const objects = raw
        .prepare(
          `SELECT type, name FROM sqlite_master
           WHERE name IN ('documents_created_at_idx', 'documents_touch_updated_at')
           ORDER BY type`,
        )
        .all()
      expect(objects).toEqual([
        { type: 'index', name: 'documents_created_at_idx' },
        { type: 'trigger', name: 'documents_touch_updated_at' },
      ])
    } finally {
      raw.close()
    }
  })

  it('serves the newest-first document list from the created_at index', () => {
    const { databasePath } = openTestDatabase()
    const raw = new DatabaseSync(databasePath)

    try {
      const plan = raw
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT id, title, body, created_at, updated_at
           FROM documents
           ORDER BY created_at DESC`,
        )
        .all() as Array<{ detail: string }>

      expect(plan.map((step) => step.detail).join('\n')).toContain(
        'documents_created_at_idx',
      )
    } finally {
      raw.close()
    }
  })

  it('keeps data across a reopen without re-applying migrations', () => {
    const { database: first, databasePath } = openTestDatabase()
    const document = first.createDocument()
    first.close()
    database = undefined

    const reopened = openDatabase(databasePath)
    database = reopened

    expect(reopened.getDocument(document.id)).toEqual(document)

    const raw = new DatabaseSync(databasePath)
    try {
      expect(raw.prepare('PRAGMA user_version').get()).toEqual({
        user_version: 1,
      })
    } finally {
      raw.close()
    }
  })
})

describe('documents', () => {
  it('creates an untitled document and reads it back by id', () => {
    const { database: store } = openTestDatabase()
    const before = Date.now()

    const document = store.createDocument()

    expect(document.id).toBeGreaterThan(0)
    expect(untitledDocumentTitle).toBe('بدون عنوان')
    expect(document.title).toBe(untitledDocumentTitle)
    expect(document.body).toBe('')
    expect(document.createdAt).toBeGreaterThanOrEqual(before)
    expect(document.createdAt).toBeLessThanOrEqual(Date.now())
    expect(document.updatedAt).toBe(document.createdAt)

    expect(store.getDocument(document.id)).toEqual(document)
    expect(store.getDocument(document.id + 1000)).toBeUndefined()
  })

  it('counts the stored documents with a dedicated count query', () => {
    const { database: store } = openTestDatabase()

    expect(store.countDocuments()).toBe(0)

    store.createDocument()
    store.createDocument()

    expect(store.countDocuments()).toBe(2)
  })

  it('bumps updated_at on update but keeps an explicitly set one', () => {
    const { database: store, databasePath } = openTestDatabase()
    const document = store.createDocument()
    const raw = new DatabaseSync(databasePath)

    const selectRow = () =>
      raw
        .prepare(
          'SELECT title, created_at, updated_at FROM documents WHERE id = ?',
        )
        .get(document.id) as {
        title: string
        created_at: number
        updated_at: number
      }

    try {
      // An update that sets updated_at itself is left alone by the trigger.
      const explicit = document.createdAt - 60_000
      raw
        .prepare('UPDATE documents SET title = ?, updated_at = ? WHERE id = ?')
        .run('ویرایش مستقیم', explicit, document.id)

      expect(selectRow()).toEqual({
        title: 'ویرایش مستقیم',
        created_at: document.createdAt,
        updated_at: explicit,
      })

      // An update of the content alone gets its updated_at refreshed.
      raw
        .prepare('UPDATE documents SET title = ? WHERE id = ?')
        .run('ویرایش', document.id)

      const touched = selectRow()
      expect(touched.title).toBe('ویرایش')
      expect(touched.created_at).toBe(document.createdAt)
      expect(touched.updated_at).toBeGreaterThan(explicit)

      // The store sees the trigger's write through its own connection.
      expect(store.getDocument(document.id)?.title).toBe('ویرایش')
    } finally {
      raw.close()
    }
  })
})

describe('parseSeedArgument', () => {
  it('parses the documented table,count layout', () => {
    expect(parseSeedArgument('documents,50-users,50')).toEqual([
      { table: 'documents', count: 50 },
      { table: 'users', count: 50 },
    ])
    expect(parseSeedArgument('documents,0')).toEqual([
      { table: 'documents', count: 0 },
    ])
  })

  it('treats an empty value as "seed nothing"', () => {
    expect(parseSeedArgument('')).toEqual([])
  })

  it('rejects entries that are not <table>,<count>', () => {
    for (const value of [
      'documents', // no count
      'documents,', // no count
      ',50', // no table
      'documents,twenty', // not a number
      '2documents,50', // table must start with a letter or underscore
      'documents,50-', // trailing separator
      '-documents,50', // leading separator
    ]) {
      expect(() => parseSeedArgument(value)).toThrowError(/Invalid --seed/)
    }
  })

  it('rejects a count beyond the safe integer range', () => {
    expect(() =>
      parseSeedArgument('documents,99999999999999999999'),
    ).toThrowError(/too large/)
  })
})

describe('resetDatabase', () => {
  it('creates and migrates the database file when it does not exist yet', () => {
    const databasePath = temporaryDatabasePath()

    resetDatabase(databasePath, [])

    const raw = new DatabaseSync(databasePath)
    try {
      expect(raw.prepare('PRAGMA user_version').get()).toEqual({
        user_version: 1,
      })
      expect(
        raw.prepare('SELECT COUNT(*) AS count FROM documents').get(),
      ).toEqual({ count: 0 })
    } finally {
      raw.close()
    }
  })

  it('removes every previous record even without seed entries', () => {
    const { database: store, databasePath } = openTestDatabase()
    store.createDocument()
    store.createDocument()
    store.close()
    database = undefined

    resetDatabase(databasePath, [])

    const reopened = openDatabase(databasePath)
    database = reopened
    expect(reopened.countDocuments()).toBe(0)
  })

  it('inserts the requested number of untitled documents', () => {
    const databasePath = temporaryDatabasePath()

    resetDatabase(databasePath, [{ table: 'documents', count: 3 }])

    const store = openDatabase(databasePath)
    database = store

    expect(store.countDocuments()).toBe(3)
    expect(store.getDocument(1)?.title).toBe(untitledDocumentTitle)
    expect(store.getDocument(3)).toBeDefined()
    expect(store.getDocument(4)).toBeUndefined()
  })

  it('replaces the previous records on every seed', () => {
    const { database: store, databasePath } = openTestDatabase()
    store.createDocument()
    store.close()
    database = undefined

    resetDatabase(databasePath, [{ table: 'documents', count: 2 }])
    resetDatabase(databasePath, [{ table: 'documents', count: 5 }])

    const reopened = openDatabase(databasePath)
    database = reopened
    expect(reopened.countDocuments()).toBe(5)
  })

  it('rejects unknown tables and keeps the previous records', () => {
    const { database: store, databasePath } = openTestDatabase()
    store.createDocument()
    store.close()
    database = undefined

    expect(() =>
      resetDatabase(databasePath, [{ table: 'users', count: 50 }]),
    ).toThrowError('Cannot seed table "users": no such table')

    const reopened = openDatabase(databasePath)
    database = reopened
    expect(reopened.countDocuments()).toBe(1)
  })
})
