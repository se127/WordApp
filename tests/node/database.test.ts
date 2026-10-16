import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, untitledDocumentTitle } from '../../electron/database.ts'
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

// Opens a fresh database in a fresh temp directory and tracks both for
// teardown, so every test starts from an empty, fully migrated file.
function openTestDatabase(): {
  database: WordAppDatabase
  databasePath: string
} {
  temporaryDirectory = mkdtempSync(
    path.join(tmpdir(), 'wordapp-database-test-'),
  )
  const databasePath = path.join(temporaryDirectory, 'db.sqlite')
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
